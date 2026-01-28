fetch("http://127.0.0.1:5001/api/history")
  .then(res => res.json())
  .then(data => {
    const table = document.getElementById("historyBody");
    table.innerHTML = "";

    if (data.length === 0) {
      table.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; opacity:0.7;">
            No detection history available
          </td>
        </tr>
      `;
      return;
    }

    data.forEach((row, index) => {
      table.innerHTML += `
        <tr>
          <td>${index + 1}</td>
          <td>${row.Event}</td>
          <td class="${row.Status === 'DANGER' ? 'badge-danger' : 'badge-safe'}">
            ${row.Status}
          </td>
          <td>${row.Date}</td>
          <td>${row.Time}</td>
        </tr>
      `;
    });
  })
  .catch(() => {
    document.getElementById("historyBody").innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; opacity:0.6;">
          History service not available
        </td>
      </tr>
    `;
  });
