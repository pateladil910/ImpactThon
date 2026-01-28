fetch("http://localhost:5001/history")
.then(res => res.json())
.then(data => {
const table = document.getElementById("history-table");
table.innerHTML = "";


data.forEach(row => {
table.innerHTML += `
<tr>
<td>${row.id}</td>
<td>${row.event}</td>
<td class="${row.status === 'DANGER' ? 'badge-danger' : 'badge-safe'}">${row.status}</td>
<td>${row.date}</td>
<td>${row.time}</td>
</tr>`;
});
});