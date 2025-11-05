import React, { useEffect, useState, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { fetchSystem, fetchContainers } from './api'

const COLORS = ['#4FD1C5', '#F6AD55', '#63B3ED', '#F56565']

export default function App(){
  const [sys, setSys] = useState(null)
  const [cont, setCont] = useState(null)
  const [history, setHistory] = useState([])

  useEffect(()=>{
    let mounted = true
    async function load(){
      const s = await fetchSystem()
      const c = await fetchContainers()
      if(!mounted) return
      setSys(s)
      setCont(c)
      setHistory(h => {
        const next = [...h, { t: new Date(s.timestamp*1000).toLocaleTimeString(), cpu: s.cpu_percent, mem: s.memory.percent }]
        return next.slice(-40)
      })
    }
    load()
    const id = setInterval(load, 3000)
    return ()=>{ mounted = false; clearInterval(id) }
  },[])

  return (
    <div className="p-6 min-h-screen">
      <div className="flex gap-6">
        <div className="flex-1 bg-[#0b1220] rounded-2xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">System Overview</h2>
            <div className="text-sm text-gray-400">Today</div>
          </div>

          <div style={{height: 320}} className="mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <XAxis dataKey="t" tick={{ fill: '#9aa6b2' }} />
                <YAxis tick={{ fill: '#9aa6b2' }} />
                <Tooltip/>
                <Line type="monotone" dataKey="cpu" stroke="#F6AD55" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="mem" stroke="#63B3ED" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[#071029] p-4 rounded-lg">
              <div className="text-sm text-gray-400">CPU</div>
              <div className="text-2xl font-bold">{sys ? sys.cpu_percent.toFixed(1) + '%' : '—'}</div>
              <div className="text-xs text-gray-500 mt-2">Per core: {sys ? sys.per_cpu.map(p=>p.toFixed(0)).join('% ') + '%' : '—'}</div>
            </div>

            <div className="bg-[#071029] p-4 rounded-lg">
              <div className="text-sm text-gray-400">Memory</div>
              <div className="text-2xl font-bold">{sys ? sys.memory.percent + '%' : '—'}</div>
              <div className="text-xs text-gray-500 mt-2">{sys ? (sys.memory.used/1024/1024).toFixed(0) + ' MB used' : ''}</div>
            </div>

            <div className="bg-[#071029] p-4 rounded-lg">
              <div className="text-sm text-gray-400">Network</div>
              <div className="text-2xl font-bold">{sys ? ((sys.net.bytes_recv+sys.net.bytes_sent)/1024/1024).toFixed(2) + ' MB' : '—'}</div>
              <div className="text-xs text-gray-500 mt-2">Rx: {sys ? (sys.net.bytes_recv/1024/1024).toFixed(2) + ' MB' : ''}</div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="bg-[#071029] p-4 rounded-lg">
              <h3 className="text-sm text-gray-400">Containers</h3>
              <div className="mt-2 text-sm">
                {cont ? (
                  <table className="w-full text-left text-xs">
                    <thead className="text-gray-400"><tr><th>Name</th><th>CPU</th><th>Mem</th></tr></thead>
                    <tbody>
                      {((cont.stats && cont.stats.length) ? cont.stats : cont.list || []).map((c, idx) => (
                        <tr key={idx} className="border-t border-[#13202b]">
                          <td className="py-2">{c.Names || c.names || c.Name || c.name || c.Names}</td>
                          <td>{c.CPUPerc || c.cpu || (c.CPUPerc===0 ? '0%' : '—')}</td>
                          <td>{c.MemPerc || c.mem || (c.MemPerc===0 ? '0%' : '—')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : '—' }
              </div>
            </div>

            <div className="bg-[#071029] p-4 rounded-lg">
              <h3 className="text-sm text-gray-400">Quick Charts</h3>
              <div className="flex gap-2 mt-4">
                <PieChart width={120} height={80}>
                  <Pie data={[{name:'a', value: sys ? sys.cpu_percent : 1},{name:'b', value: 100-(sys?sys.cpu_percent:1)}]} dataKey="value" innerRadius={28} outerRadius={40}>
                    <Cell fill={COLORS[0]} />
                    <Cell fill="#0f1724" />
                  </Pie>
                </PieChart>
                <PieChart width={120} height={80}>
                  <Pie data={[{name:'a', value: sys ? sys.memory.percent : 1},{name:'b', value: 100-(sys?sys.memory.percent:1)}]} dataKey="value" innerRadius={28} outerRadius={40}>
                    <Cell fill={COLORS[2]} />
                    <Cell fill="#0f1724" />
                  </Pie>
                </PieChart>
              </div>
            </div>
          </div>
        </div>

        <div className="w-72 bg-[#071029] rounded-2xl p-4">
          <h4 className="text-sm text-gray-400">Overview</h4>
          <div className="mt-4 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-xs text-gray-400">Revenue</div>
                <div className="font-bold text-lg">4.6M</div>
              </div>
              <div className="text-sm text-green-400">+3.4%</div>
            </div>

            <div className="flex justify-between items-center">
              <div>
                <div className="text-xs text-gray-400">Sold Items</div>
                <div className="font-bold text-lg">769</div>
              </div>
              <div className="text-sm text-cyan-300">—</div>
            </div>

            <div className="pt-2 border-t border-[#13202b] text-xs text-gray-400">
              <div>Electronics <span className="float-right">96/1.2M</span></div>
              <div>Home/Kitchen <span className="float-right">29/68k</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}