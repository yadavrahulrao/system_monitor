  // Global charts
  let cpuChart, memoryPie, containerMemChart;

  // Fetch data function
  async function fetchData() {
      try {
          // System data
          const systemRes = await fetch('/api/system');
          const system = await systemRes.json();

          // Update CPU
          document.getElementById('cpuValue').textContent = `${system.cpu_percent}%`;
          if (cpuChart) cpuChart.destroy();
          const cpuCtx = document.getElementById('cpuChart').getContext('2d');
          cpuChart = new Chart(cpuCtx, {
              type: 'line',
              data: {
                  labels: [new Date().toLocaleTimeString()],
                  datasets: [{
                      label: 'CPU %',
                      data: [system.cpu_percent],
                      borderColor: '#00ff88',
                      backgroundColor: 'rgba(0, 255, 136, 0.2)',
                      tension: 0.4
                  }]
              },
              options: { responsive: true, scales: { y: { beginAtZero: true, max: 100 } } }
          });

          // Update Memory Pie
          const memUsed = system.memory.used;
          const memTotal = system.memory.total;
          const memPercent = system.memory.percent;
          document.getElementById('memoryValue').textContent = `${memPercent.toFixed(1)}%`;
          if (memoryPie) memoryPie.destroy();
          const memCtx = document.getElementById('memoryPie').getContext('2d');
          memoryPie = new Chart(memCtx, {
              type: 'pie',
              data: {
                  labels: ['Used', 'Free'],
                  datasets: [{
                      data: [memUsed, memTotal - memUsed],
                      backgroundColor: ['#ff6384', '#36a2eb']
                  }]
              },
              options: { responsive: true }
          });

          // Update Disk
          const diskPercent = system.disk.percent;
          document.getElementById('diskValue').textContent = `${diskPercent.toFixed(1)}%`;
          document.getElementById('diskDetails').innerHTML = `
              Used: ${(system.disk.used).toFixed(1)} GB / Total: ${(system.disk.total).toFixed(1)} GB
          `;

          // Containers data
          const containersRes = await fetch('/api/containers');
          const containersData = await containersRes.json();
          if (containersData.error) {
              document.getElementById('containersList').innerHTML = `<p>Error: ${containersData.error}</p>`;
              return;
          }

          let listHtml = '';
          let memData = { labels: [], data: [] };
          containersData.containers.forEach(cont => {
              listHtml += `
                  <div class="container-item">
                      <span>${cont.name} (${cont.id}) - ${cont.status}</span>
                      <span>CPU: ${cont.cpu}% | Mem: ${cont.mem_percent}%</span>
                  </div>
              `;
              memData.labels.push(cont.name);
              memData.data.push(cont.mem_percent);
          });
          document.getElementById('containersList').innerHTML = listHtml || '<p>No running containers.</p>';

          // Container Memory Pie
          if (containerMemChart) containerMemChart.destroy();
          const contCtx = document.getElementById('containerMemChart').getContext('2d');
          containerMemChart = new Chart(contCtx, {
              type: 'pie',
              data: {
                  labels: memData.labels,
                  datasets: [{
                      data: memData.data,
                      backgroundColor: ['#ff6384', '#36a2eb', '#ffce56', '#4bc0c0', '#9966ff']
                  }]
              },
              options: { responsive: true }
          });

      } catch (error) {
          console.error('Fetch error:', error);
      }
  }

  // Initial load and auto-refresh every 5 seconds
  fetchData();
  setInterval(fetchData, 5000);
  