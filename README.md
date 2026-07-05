# bid
bid reactivity engine lib



import { signal, bindList } from 'https://cdn.jsdelivr.net/gh/ChisAdrian/bid@main/bid.js';

const headers = signal(['ID', 'Name', 'Email']);
const users = signal([
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' }
]);

// thead
bindList('thead', headers, text => {
    const th = document.createElement('th');
    th.textContent = text;
    return th;
});

// tbody
bindList('tbody', users, user => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${user.id}</td><td>${user.name}</td><td>${user.email}</td>`;
    return tr;
}, { keyFn: u => u.id });
