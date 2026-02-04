function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatProjectId(ts = Date.now()) {
  const d = new Date(ts);
  const yy = String(d.getFullYear()).slice(-2);
  return `${yy}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

module.exports = { pad2, formatProjectId };
