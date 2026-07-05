# bid
bid reactivity engine lib



const headers = signal(['ID', 'Name', 'Email']);
const users = signal([
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' }
]);

// thead — row of headers
bindList('thead', headers, (text) => {
    const th = document.createElement('th');
    th.textContent = text;
    return th;
}, { keyFn: (item, i) => i });

// tbody — rows of users
bindList('tbody', users, (user) => {
    const tr = document.createElement('tr');
    ['id', 'name', 'email'].forEach(prop => {
        const td = document.createElement('td');
        td.textContent = user[prop];
        tr.appendChild(td);
    });
    return tr;
}, { keyFn: user => user.id });

