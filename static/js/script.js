// Global charts and data stores
let cpuChart, memoryChart, diskChart, networkChart, containerMemChart;
const colors = [
    "#FF5733", "#FFC300", "#DAF7A6", "#33FF57", "#33FFF3",
    "#3375FF", "#B833FF", "#FF33A8", "#FF8C33", "#C70039"
];
let cpuData = { labels: [], datasets: [] };  // Multi-core trends

// Initialize contexts (error if canvas missing)
const ctxCPU = document.getElementById("cpuChart")?.getContext("2d");
const ctxMem = document.getElementById("memoryChart")?.getContext("2d");
const ctxNet = document.getElementById("networkChart")?.getContext("2d");
const ctxDisk = document.getElementById("diskChart")?.getContext("2d");
const ctxCont = document.getElementById("containerMemChart")?.getContext("2d");

if (!ctxCPU || !ctxMem || !ctxNet || !ctxDisk || !ctxCont) {
    console.error("Missing canvas elements—check HTML");
}

// Update function (with error handling)
async function updateData() {
    try {
        console.log("Fetching data...");  // Debug

        // System data
        const systemRes = await fetch("/api/system");
        if (!systemRes.ok) throw new Error(`System API: ${systemRes.status}`);
        const system = await systemRes.json();
        if (system.error) throw new Error(system.error);

        const time = new Date().toLocaleTimeString();

        // CPU Line Chart (multi-core trends; UPDATED: Stepped Y-axis 0-100 by 10)
        const cpuValueEl = document.getElementById("cpuValue");
        if (cpuValueEl) cpuValueEl.textContent = `${system.cpu_percent.toFixed(1)}% (Overall)`;
        if (system.cpu_percent > 80) cpuValueEl?.classList.add("high-usage");
        else cpuValueEl?.classList.remove("high-usage");

        cpuData.labels.push(time);
        if (cpuData.labels.length > 20) {
            cpuData.labels.shift();
            cpuData.datasets.forEach(ds => ds.data.shift());
        }

        // Init datasets if first run (multi-core)
        if (cpuData.datasets.length === 0 && system.cpu_per_core) {
            system.cpu_per_core.forEach((_, i) => {
                cpuData.datasets.push({
                    label: `Core ${i + 1}`,
                    data: [],
                    borderColor: colors[i % colors.length],
                    backgroundColor: colors[i % colors.length] + "20",
                    fill: false,
                    tension: 0.4
                });
            });
        }

        // Update per-core data
        system.cpu_per_core?.forEach((val, i) => {
            if (cpuData.datasets[i]) cpuData.datasets[i].data.push(val);
        });

        // OPTIONAL: Single overall CPU line (uncomment to replace multi-core)
        // cpuData.datasets = [{
        //     label: "Overall CPU %",
        //     data: [system.cpu_percent],  // Push overall instead of per-core
        //     borderColor: "#00ff88",
        //     backgroundColor: "rgba(0, 255, 136, 0.2)",
        //     fill: true,
        //     tension: 0.4
        // }];
        // cpuData.labels.push(time);  // For single line history

        if (cpuChart) cpuChart.destroy();
        if (ctxCPU) {
            cpuChart = new Chart(ctxCPU, {
                type: "line",
                data: cpuData,
                options: {
                    responsive: true,
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            ticks: {
                                stepSize: 10  // FIXED: Steps of 10 (0, 10, 20, ..., 100)
                            },
                            grid: {
                                color: "rgba(255, 255, 255, 0.1)"  // Subtle grid lines for steps
                            }
                        },
                        x: {
                            grid: { display: false }  // Hide X grid for cleaner look
                        }
                    },
                    plugins: { 
                        legend: { position: "top" },
                        tooltip: { 
                            callbacks: {
                                label: function(context) {
                                    return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}%`;
                                }
                            }
                        }
                    },
                    animation: { duration: 500 }  // Smooth updates
                }
            });
        }

        // Memory Pie Chart (used vs free)
        const memValueEl = document.getElementById("memoryValue");
        if (memValueEl) memValueEl.textContent = `${system.memory.percent.toFixed(1)}%`;
        if (system.memory.percent > 80) memValueEl?.classList.add("high-usage");
        else memValueEl?.classList.remove("high-usage");

        const memUsed = system.memory.used;
        const memFree = system.memory.total - memUsed;
        if (memoryChart) memoryChart.destroy();
        if (ctxMem) {
            memoryChart = new Chart(ctxMem, {
                type: "pie",
                data: {
                    labels: ["Used", "Free"],
                    datasets: [{
                        data: [memUsed, memFree],
                        backgroundColor: ["#ff6384", "#36a2eb"]
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { position: "bottom" } }
                }
            });
        }

        // Disk Bar Chart (used vs total GB)
        const diskValueEl = document.getElementById("diskValue");
        if (diskValueEl) diskValueEl.textContent = `${system.disk.percent.toFixed(1)}%`;
        if (system.disk.percent > 80) diskValueEl?.classList.add("high-usage");
        else diskValueEl?.classList.remove("high-usage");

        if (diskChart) diskChart.destroy();
        if (ctxDisk) {
            diskChart = new Chart(ctxDisk, {
                type: "bar",
                data: {
                    labels: ["Used", "Total"],
                    datasets: [{
                        label: "Disk (GB)",
                        data: [system.disk.used, system.disk.total],
                        backgroundColor: ["#ff9f40", "#4ecdc4"]
                    }]
                },
                options: {
                    responsive: true,
                    scales: { y: { beginAtZero: true } },
                    plugins: { legend: { display: false } }
                }
            });
        }

        // Network Bar Chart (sent vs recv MB)
        const netValueEl = document.getElementById("networkValue");
        if (netValueEl) netValueEl.textContent = `Sent: ${system.network.bytes_sent.toFixed(1)} MB | Recv: ${system.network.bytes_recv.toFixed(1)} MB`;

        if (networkChart) networkChart.destroy();
        if (ctxNet) {
            networkChart = new Chart(ctxNet, {
                type: "bar",
                data: {
                    labels: ["Sent", "Received"],
                    datasets: [{
                        label: "Network (MB)",
                        data: [system.network.bytes_sent, system.network.bytes_recv],
                        backgroundColor: ["#9966ff", "#ff6384"]
                    }]
                },
                options: {
                    responsive: true,
                    scales: { y: { beginAtZero: true } },
                    plugins: { legend: { display: false } }
                }
            });
        }

        // Containers (fetch and pie/list)
        const containersRes = await fetch("/api/containers");
        if (!containersRes.ok) throw new Error(`Containers API: ${containersRes.status}`);
        const containersData = await containersRes.json();

        const containersListEl = document.getElementById("containersList");
        if (containersListEl) {
            if (containersData.error) {
                containersListEl.innerHTML = `<p style="color: #ff6b6b; text-align: center;">Error: ${containersData.error}</p>`;
            } else {
                let listHtml = "";
                let memData = { labels: [], data: [] };
                containersData.containers.forEach((cont, i) => {
                    listHtml += `
                        <div class="container-item">
                            <span>${cont.name} (${cont.id}) - ${cont.status}</span>
                            <span>CPU: ${cont.cpu.toFixed(1)}% | Mem: ${cont.mem_percent.toFixed(1)}%</span>
                        </div>
                    `;
                    memData.labels.push(cont.name);
                    memData.data.push(cont.mem_percent);
                });
                containersListEl.innerHTML = listHtml || '<p style="text-align: center; color: #ffd700;">No running containers.</p>';

                // Containers Memory Pie
                if (memData.labels.length > 0) {
                    document.getElementById("containerMemChart").style.display = "block";
                    if (containerMemChart) containerMemChart.destroy();
                    if (ctxCont) {
                        containerMemChart = new Chart(ctxCont, {
                            type: "pie",
                            data: {
                                labels: memData.labels,
                                datasets: [{
                                    data: memData.data,
                                    backgroundColor: colors.slice(0, memData.labels.length)
                                }]
                            },
                            options: {
                                responsive: true,
                                plugins: { legend: { position: "right" } }
                            }
                        });
                    }
                } else {
                    document.getElementById("containerMemChart").style.display = "none";
                }
            }
        }

        console.log("Data updated successfully");  // Debug

    } catch (error) {
        console.error("Update error:", error);
        // Fallback UI
        const containersListEl = document.getElementById("containersList");
        if (containersListEl) {
            containersListEl.innerHTML = `<p style="color: #ff6b6b; text-align: center;">Failed to load: ${error.message}</p>`;
        }
        // Metrics fallback
        ["cpuValue", "memoryValue", "diskValue", "networkValue"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = "Error loading...";
        });
    }
}

// Initial load and poll every 5 seconds
updateData();
setInterval(updateData, 5000);