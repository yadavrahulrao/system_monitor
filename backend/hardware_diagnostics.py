"""Read-only Linux laptop hardware inventory and health diagnostics.

This module reports only what the OS and optional diagnostic utilities expose.
It never writes to device firmware, runs stress tests, or changes hardware state.
"""
from __future__ import annotations

import json
import os
import platform
import re
import shutil
import socket
import subprocess
import time
from pathlib import Path
from typing import Any, Optional, Union

import psutil


SYS = Path('/sys')


def _run(args: list[str], timeout: float = 3.0) -> tuple[int, str, str]:
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=False)
        return p.returncode, p.stdout.strip(), p.stderr.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired, PermissionError, OSError):
        return 127, '', 'unavailable'


def _read(path: Path, default: str = '') -> str:
    try:
        return path.read_text(errors='replace').strip()
    except (OSError, PermissionError):
        return default


def _component(cid: str, name: str, category: str, status: str, summary: str,
               details: Optional[dict[str, Any]] = None, note: Optional[str] = None) -> dict[str, Any]:
    item = {'id': cid, 'name': name, 'category': category, 'status': status,
            'summary': summary, 'details': details or {}}
    if note:
        item['note'] = note
    return item


def _bytes(value: Optional[Union[int, float]]) -> str:
    if value is None:
        return 'Unknown'
    n = float(value)
    for unit in ('B', 'KB', 'MB', 'GB', 'TB'):
        if n < 1024 or unit == 'TB':
            return f'{n:.1f} {unit}'
        n /= 1024
    return 'Unknown'


def _temperatures() -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    try:
        for chip, entries in psutil.sensors_temperatures(fahrenheit=False).items():
            for entry in entries:
                found.append({'sensor': entry.label or chip, 'chip': chip,
                              'current_c': entry.current, 'high_c': entry.high,
                              'critical_c': entry.critical})
    except (AttributeError, OSError, RuntimeError):
        pass
    # Add Linux hwmon sensors that psutil may not expose.
    for hwmon in (SYS / 'class' / 'hwmon').glob('hwmon*'):
        chip = _read(hwmon / 'name', hwmon.name)
        for inp in hwmon.glob('temp*_input'):
            raw = _read(inp)
            if raw.isdigit():
                label = _read(inp.with_name(inp.name.replace('_input', '_label')), inp.stem)
                value = int(raw) / 1000
                if not any(x['chip'] == chip and x['sensor'] == label for x in found):
                    found.append({'sensor': label, 'chip': chip, 'current_c': value,
                                  'high_c': None, 'critical_c': None})
    return found


def _battery_data() -> Optional[dict[str, Any]]:
    batteries = []
    for item in (SYS / 'class' / 'power_supply').glob('*'):
        typ = _read(item / 'type').lower()
        if typ != 'battery':
            continue
        capacity = _read(item / 'capacity')
        status = _read(item / 'status', 'Unknown')
        energy_full = _read(item / 'energy_full') or _read(item / 'charge_full')
        energy_design = _read(item / 'energy_full_design') or _read(item / 'charge_full_design')
        try:
            health = round(float(energy_full) / float(energy_design) * 100, 1) if energy_full and energy_design and float(energy_design) > 0 else None
        except ValueError:
            health = None
        batteries.append({'name': item.name, 'capacity_percent': int(capacity) if capacity.isdigit() else None,
                          'status': status, 'health_percent': health,
                          'cycle_count': _read(item / 'cycle_count') or None,
                          'manufacturer': _read(item / 'manufacturer') or None,
                          'model': _read(item / 'model_name') or None,
                          'voltage_now': _read(item / 'voltage_now') or None})
    if batteries:
        return {'batteries': batteries}
    try:
        b = psutil.sensors_battery()
        if b:
            return {'batteries': [{'name': 'Battery', 'capacity_percent': b.percent,
                                   'status': 'Plugged in' if b.power_plugged else 'Discharging',
                                   'health_percent': None, 'cycle_count': None}]}
    except (AttributeError, OSError):
        pass
    return None


def _disk_inventory() -> list[dict[str, Any]]:
    rc, out, _ = _run(['lsblk', '-J', '-b', '-o', 'NAME,TYPE,SIZE,MODEL,ROTA,TRAN,MOUNTPOINT'], 4)
    disks: list[dict[str, Any]] = []
    if rc == 0 and out:
        try:
            def walk(rows: list[dict[str, Any]]):
                for row in rows:
                    if row.get('type') == 'disk':
                        disks.append({'device': '/dev/' + row.get('name', ''),
                                      'model': row.get('model') or 'Unknown model',
                                      'size_bytes': int(row.get('size') or 0),
                                      'rotational': bool(int(row.get('rota') or 0)),
                                      'transport': row.get('tran') or 'Unknown'})
                    walk(row.get('children') or [])
            walk(json.loads(out).get('blockdevices', []))
        except (ValueError, TypeError):
            pass
    if not disks:
        seen = set()
        for part in psutil.disk_partitions(all=True):
            device = part.device
            if device and device not in seen and device.startswith('/dev/'):
                seen.add(device)
                disks.append({'device': device, 'model': 'Unknown model', 'size_bytes': None,
                              'rotational': None, 'transport': 'Unknown'})
    return disks


def _smart_health(device: str) -> dict[str, Any]:
    if not shutil.which('smartctl'):
        return {'status': 'unknown', 'summary': 'smartctl is not installed; drive health could not be verified'}
    rc, out, err = _run(['smartctl', '-H', '-A', '-j', device], 6)
    try:
        data = json.loads(out) if out else {}
    except ValueError:
        data = {}
    smart = data.get('smart_status', {}).get('passed')
    nvme = data.get('nvme_smart_health_information_log', {})
    critical = nvme.get('critical_warning')
    if smart is False or (critical not in (None, 0)):
        status, summary = 'critical', 'Drive self-monitoring reports a health warning'
    elif smart is True:
        status, summary = 'healthy', 'Drive self-monitoring reports PASSED'
    elif rc not in (0, 2):
        status, summary = 'unknown', 'SMART data unavailable (permissions, controller or device support)'
    else:
        status, summary = 'unknown', 'SMART health result not provided by this drive'
    return {'status': status, 'summary': summary,
            'temperature_c': nvme.get('temperature'),
            'percentage_used': nvme.get('percentage_used'),
            'available_spare_percent': nvme.get('available_spare'),
            'power_on_hours': data.get('power_on_time', {}).get('hours'),
            'error': err[:240] if err and status == 'unknown' else None}


def _pci_devices() -> list[dict[str, str]]:
    rc, out, _ = _run(['lspci', '-nn'], 3)
    if rc != 0:
        return []
    return [{'address': line.split(' ', 1)[0], 'description': line.split(' ', 1)[1] if ' ' in line else line}
            for line in out.splitlines() if line.strip()]


def _usb_devices() -> list[str]:
    rc, out, _ = _run(['lsusb'], 3)
    return [line.strip() for line in out.splitlines() if line.strip()] if rc == 0 else []


def _device_presence() -> dict[str, Any]:
    input_names = []
    for p in (SYS / 'class' / 'input').glob('event*'):
        name = _read(p / 'device' / 'name')
        if name:
            input_names.append(name)
    netifs = []
    for name in psutil.net_if_addrs():
        netifs.append({'name': name, 'is_up': psutil.net_if_stats().get(name).isup if name in psutil.net_if_stats() else None})
    audio = list((SYS / 'class' / 'sound').glob('card*'))
    cameras = list((SYS / 'class' / 'video4linux').glob('video*'))
    bt = list((SYS / 'class' / 'bluetooth').glob('*'))
    usb_controllers = [x for x in _pci_devices() if re.search(r'USB controller', x['description'], re.I)]
    gpus = [x for x in _pci_devices() if re.search(r'VGA compatible|3D controller|Display controller', x['description'], re.I)]
    return {'input_devices': sorted(set(input_names)), 'network_interfaces': netifs,
            'audio_devices': [x.name for x in audio], 'camera_devices': [x.name for x in cameras],
            'bluetooth_adapters': [x.name for x in bt], 'usb_controllers': usb_controllers,
            'gpu_devices': gpus}


def collect_hardware_overview() -> dict[str, Any]:
    """Collect a fresh read-only snapshot of available hardware diagnostics."""
    scanned_at = int(time.time())
    components: list[dict[str, Any]] = []
    cpu_name = platform.processor()
    if not cpu_name and Path('/proc/cpuinfo').exists():
        for line in _read(Path('/proc/cpuinfo')).splitlines():
            if line.lower().startswith(('model name', 'hardware', 'processor')) and ':' in line:
                cpu_name = line.split(':', 1)[1].strip()
                if cpu_name:
                    break
    cpu_name = cpu_name or platform.machine()
    freq = None
    try:
        f = psutil.cpu_freq()
        freq = round(f.current, 0) if f and f.current else None
    except (AttributeError, OSError):
        pass
    components.append(_component('cpu', 'Processor', 'compute', 'healthy',
        f'{cpu_name or platform.machine()} · {psutil.cpu_count(logical=False) or "?"} physical / {psutil.cpu_count() or "?"} logical cores',
        {'model': cpu_name, 'architecture': platform.machine(), 'physical_cores': psutil.cpu_count(logical=False),
         'logical_cores': psutil.cpu_count(), 'frequency_mhz': freq, 'load_average': list(os.getloadavg()) if hasattr(os, 'getloadavg') else None},
        'Detection and operating metrics only; this is not a CPU stress test or a complete silicon self-test.'))

    vm = psutil.virtual_memory()
    ram_status = 'warning' if vm.percent >= 90 else 'healthy'
    components.append(_component('memory', 'System memory', 'memory', ram_status,
        f'{_bytes(vm.total)} installed · {vm.percent:.1f}% currently used',
        {'total_bytes': vm.total, 'available_bytes': vm.available, 'used_bytes': vm.used,
         'used_percent': vm.percent, 'swap_total_bytes': psutil.swap_memory().total,
         'swap_used_percent': psutil.swap_memory().percent},
        'The OS does not expose a universal live test for defective RAM cells. Use a bootable memory test for a full check.'))

    temps = _temperatures()
    critical_temps = [t for t in temps if t.get('critical_c') is not None and t.get('current_c') is not None and t['current_c'] >= t['critical_c']]
    hot_temps = [t for t in temps if t.get('high_c') is not None and t.get('current_c') is not None and t['current_c'] >= t['high_c']]
    thermal_status = 'critical' if critical_temps else ('warning' if hot_temps else ('healthy' if temps else 'unknown'))
    components.append(_component('thermal', 'Thermal sensors', 'cooling', thermal_status,
        f'{len(temps)} temperature sensor(s) detected' if temps else 'No temperature sensors exposed by this system',
        {'sensors': temps}, 'Sensor coverage depends on laptop firmware and kernel drivers.'))

    fans = []
    try:
        for chip, entries in psutil.sensors_fans().items():
            for entry in entries:
                fans.append({'sensor': entry.label or chip, 'chip': chip, 'rpm': entry.current})
    except (AttributeError, OSError, RuntimeError):
        pass
    for hwmon in (SYS / 'class' / 'hwmon').glob('hwmon*'):
        chip = _read(hwmon / 'name', hwmon.name)
        for inp in hwmon.glob('fan*_input'):
            rpm = _read(inp)
            if rpm.isdigit() and not any(f['chip'] == chip and f['sensor'] == inp.stem for f in fans):
                fans.append({'sensor': inp.stem, 'chip': chip, 'rpm': int(rpm)})
    components.append(_component('fans', 'Cooling fans', 'cooling', 'healthy' if fans else 'unknown',
        f'{len(fans)} fan speed sensor(s) detected' if fans else 'Fan RPM telemetry unavailable',
        {'sensors': fans}, 'Many laptops do not expose fan RPM to the OS. No fan is declared failed solely because telemetry is missing.'))

    disks = _disk_inventory()
    disk_items = []
    disk_statuses = []
    for disk in disks:
        smart = _smart_health(disk['device'])
        disk_items.append({**disk, 'size_human': _bytes(disk.get('size_bytes')), 'smart': smart})
        disk_statuses.append(smart['status'])
    disk_status = 'critical' if 'critical' in disk_statuses else ('warning' if 'warning' in disk_statuses else ('healthy' if disks and all(s == 'healthy' for s in disk_statuses) else 'unknown'))
    components.append(_component('storage', 'SSD / HDD storage', 'storage', disk_status,
        f'{len(disks)} physical drive(s) discovered' if disks else 'No physical drives could be enumerated',
        {'drives': disk_items}, 'SMART support and permissions vary by controller. Unknown means health was not verified, not that the drive is defective.'))

    battery = _battery_data()
    if battery:
        healths = [b.get('health_percent') for b in battery['batteries'] if b.get('health_percent') is not None]
        worst = min(healths) if healths else None
        bstatus = 'critical' if worst is not None and worst < 60 else ('warning' if worst is not None and worst < 80 else 'healthy')
        bsummary = f'Battery detected · {worst:.1f}% design capacity remaining' if worst is not None else 'Battery detected · health capacity not exposed'
    else:
        bstatus, bsummary = 'unknown', 'No battery information exposed (desktop or unsupported firmware)'
    components.append(_component('battery', 'Battery', 'power', bstatus, bsummary, battery or {},
        'Battery wear estimates depend on firmware-reported full-charge and design capacities.'))

    presence = _device_presence()
    pci = _pci_devices()
    components.append(_component('gpu', 'Graphics adapters', 'compute', 'healthy' if presence['gpu_devices'] else 'unknown',
        f'{len(presence["gpu_devices"])} graphics adapter(s) detected' if presence['gpu_devices'] else 'GPU details unavailable from lspci',
        {'devices': presence['gpu_devices']}, 'GPU temperature, utilization and VRAM telemetry may require vendor-specific drivers/tools.'))
    components.append(_component('motherboard', 'Motherboard & firmware', 'system', 'unknown',
        f'{platform.machine()} · {platform.system()} {platform.release()}',
        {'vendor': _read(SYS / 'class' / 'dmi' / 'id' / 'sys_vendor') or None,
         'product': _read(SYS / 'class' / 'dmi' / 'id' / 'product_name') or None,
         'board_name': _read(SYS / 'class' / 'dmi' / 'id' / 'board_name') or None,
         'bios_vendor': _read(SYS / 'class' / 'dmi' / 'id' / 'bios_vendor') or None,
         'bios_version': _read(SYS / 'class' / 'dmi' / 'id' / 'bios_version') or None,
         'bios_date': _read(SYS / 'class' / 'dmi' / 'id' / 'bios_date') or None},
        'Generic motherboard electrical and component-level self-tests are not available through a standard Linux interface.'))
    components.append(_component('network', 'Network adapters', 'connectivity', 'healthy' if presence['network_interfaces'] else 'unknown',
        f'{len(presence["network_interfaces"])} interface(s) detected', {'interfaces': presence['network_interfaces']}))
    components.append(_component('usb', 'USB controllers & devices', 'connectivity', 'healthy' if presence['usb_controllers'] else 'unknown',
        f'{len(presence["usb_controllers"])} controller(s) · {len(_usb_devices())} USB device(s) visible',
        {'controllers': presence['usb_controllers'], 'devices': _usb_devices()},
        'An empty port cannot be electrically tested without a known-good device or loopback accessory.'))
    components.append(_component('audio', 'Audio devices', 'peripherals', 'healthy' if presence['audio_devices'] else 'unknown',
        f'{len(presence["audio_devices"])} audio device(s) detected', {'devices': presence['audio_devices']},
        'Detection does not verify speaker, microphone or jack sound quality; use manual playback/recording tests.'))
    components.append(_component('camera', 'Webcam', 'peripherals', 'healthy' if presence['camera_devices'] else 'unknown',
        f'{len(presence["camera_devices"])} camera device(s) detected', {'devices': presence['camera_devices']},
        'Camera capture is not started automatically to protect privacy.'))
    components.append(_component('bluetooth', 'Bluetooth adapter', 'connectivity', 'healthy' if presence['bluetooth_adapters'] else 'unknown',
        f'{len(presence["bluetooth_adapters"])} adapter(s) detected', {'adapters': presence['bluetooth_adapters']}))
    input_names = presence['input_devices']
    keyboard = [n for n in input_names if re.search(r'keyboard|keypad', n, re.I)]
    touch = [n for n in input_names if re.search(r'touchpad|trackpad|mouse', n, re.I)]
    components.append(_component('keyboard', 'Keyboard', 'peripherals', 'healthy' if keyboard else 'unknown',
        f'{len(keyboard)} keyboard input device(s) detected' if keyboard else 'Keyboard device not clearly identified', {'devices': keyboard},
        'Key-by-key operation requires the interactive keyboard test below.'))
    components.append(_component('touchpad', 'Touchpad / pointing devices', 'peripherals', 'healthy' if touch else 'unknown',
        f'{len(touch)} pointing device(s) detected' if touch else 'Touchpad not clearly identified', {'devices': touch},
        'Movement and click operation require an interactive test.'))

    try:
        display = os.environ.get('WAYLAND_DISPLAY') or os.environ.get('DISPLAY')
        rc, out, _ = _run(['xrandr', '--current'], 3) if display else (127, '', '')
        modes = [line.strip() for line in out.splitlines() if re.search(r'\b\d+x\d+\b', line)] if rc == 0 else []
    except Exception:
        modes = []
    components.append(_component('display', 'Display', 'peripherals', 'healthy' if modes else 'unknown',
        modes[0] if modes else 'Display mode information unavailable in this session', {'reported_modes': modes[:12]},
        'Dead pixels, backlight uniformity and panel artifacts require a visual test.'))

    critical_count = sum(c['status'] == 'critical' for c in components)
    warning_count = sum(c['status'] == 'warning' for c in components)
    healthy_count = sum(c['status'] == 'healthy' for c in components)
    unknown_count = sum(c['status'] == 'unknown' for c in components)
    overall = 'critical' if critical_count else ('warning' if warning_count else ('unknown' if healthy_count == 0 else ('partial' if unknown_count else 'healthy')))
    return {'scanned_at': scanned_at, 'hostname': socket.gethostname(),
            'platform': {'system': platform.system(), 'release': platform.release(), 'version': platform.version(),
                         'machine': platform.machine(), 'python': platform.python_version()},
            'summary': {'total': len(components), 'healthy': healthy_count, 'warning': warning_count,
                        'critical': critical_count, 'unknown': unknown_count,
                        'overall_status': overall},
            'components': components,
            'diagnostic_tools': {name: bool(shutil.which(name)) for name in ('lspci', 'lsusb', 'smartctl', 'nvme', 'sensors', 'xrandr', 'nvidia-smi')},
            'safety': {'mode': 'read-only', 'stress_tests_run': False,
                       'message': 'No stress tests, firmware writes, device resets, camera capture or destructive operations were performed.'}}


def get_manual_test_catalog() -> dict[str, Any]:
    """Return user-guided tests; these are intentionally not automated remotely."""
    return {'tests': [
        {'id': 'keyboard', 'name': 'Keyboard key test', 'kind': 'interactive', 'instructions': 'Open a blank text field or trusted local keyboard tester and press each key. Confirm every key registers once; check modifier and function-row keys separately.'},
        {'id': 'touchpad', 'name': 'Touchpad test', 'kind': 'interactive', 'instructions': 'Move the pointer, test single/double click, two-finger scrolling and multi-touch gestures.'},
        {'id': 'display', 'name': 'Display pixel test', 'kind': 'visual', 'instructions': 'Show full-screen solid colors (black, white, red, green and blue) and inspect for stuck/dead pixels, lines and backlight defects.'},
        {'id': 'audio', 'name': 'Speaker and microphone test', 'kind': 'interactive', 'instructions': 'Play a short test tone and record/play back a short microphone sample. The app does not record automatically.'},
        {'id': 'camera', 'name': 'Webcam test', 'kind': 'privacy', 'instructions': 'Open a local camera preview only after you explicitly choose to start it; check focus, image and privacy shutter.'},
        {'id': 'usb', 'name': 'USB port test', 'kind': 'manual', 'instructions': 'Connect a known-good USB device to each port one at a time and verify detection and stable operation.'},
        {'id': 'memory', 'name': 'Full RAM test', 'kind': 'boot_required', 'instructions': 'For a comprehensive memory-cell test, use a trusted bootable memory diagnostic. Save work first; this requires reboot and is not launched by this app.'},
        {'id': 'storage', 'name': 'Extended drive self-test', 'kind': 'manual', 'instructions': 'Review SMART status first. Extended SMART/NVMe self-tests can increase device activity; run only after backup and explicit user confirmation using the vendor tool.'},
    ], 'note': 'The catalog describes tests and does not execute them. No reboot-required, stress, camera, audio-recording or destructive tests are started automatically.'}
