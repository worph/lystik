(function() {
  const input = document.getElementById('item-input');
  const activeList = document.getElementById('items-active');
  const completedList = document.getElementById('items-completed');
  const completedSection = document.getElementById('completed-section');
  const completedHeader = document.getElementById('completed-header');
  const completedCount = document.getElementById('completed-count');
  const notifyBtn = document.getElementById('notify-btn');
  const snackbar = document.getElementById('snackbar');
  const snackbarUndo = document.getElementById('snackbar-undo');

  let items = [];
  let deletedItem = null;
  let snackbarTimeout = null;
  let draggedItem = null;

  // Notification permission
  if ('Notification' in window) {
    if (Notification.permission === 'granted' || Notification.permission === 'denied') {
      notifyBtn.classList.add('hidden');
    }
  } else {
    notifyBtn.classList.add('hidden');
  }

  notifyBtn.addEventListener('click', async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted' || permission === 'denied') {
        notifyBtn.classList.add('hidden');
      }
    }
  });

  function showNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  }

  // Render item
  function renderItem(item) {
    const li = document.createElement('li');
    li.className = 'item' + (item.checked ? ' checked' : '');
    li.dataset.id = item.id;
    li.draggable = true;

    // Drag handle
    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle';
    dragHandle.innerHTML = '<svg class="icon"><use href="#icon-grip"/></svg>';

    // Drag events
    li.addEventListener('dragstart', (e) => {
      draggedItem = item;
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.id);
    });

    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      draggedItem = null;
      document.querySelectorAll('.item.drag-over').forEach(el => el.classList.remove('drag-over'));
    });

    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (draggedItem && draggedItem.id !== item.id) {
        e.dataTransfer.dropEffect = 'move';
        li.classList.add('drag-over');
      }
    });

    li.addEventListener('dragleave', () => {
      li.classList.remove('drag-over');
    });

    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.classList.remove('drag-over');
      if (draggedItem && draggedItem.id !== item.id) {
        reorderItems(draggedItem.id, item.id);
      }
    });

    // Checkbox button
    const checkboxBtn = document.createElement('button');
    checkboxBtn.className = 'checkbox-btn';
    checkboxBtn.innerHTML = item.checked
      ? '<svg class="icon"><use href="#icon-check-square"/></svg>'
      : '<svg class="icon"><use href="#icon-square"/></svg>';
    checkboxBtn.addEventListener('click', () => toggleItem(item.id));

    // Item text
    const text = document.createElement('span');
    text.className = 'item-text';
    text.textContent = item.text;

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '<svg class="icon"><use href="#icon-x"/></svg>';
    deleteBtn.addEventListener('click', () => deleteItem(item.id));

    li.appendChild(dragHandle);
    li.appendChild(checkboxBtn);
    li.appendChild(text);
    li.appendChild(deleteBtn);

    return li;
  }

  function updateCompletedSection() {
    const completedItems = items.filter(item => item.checked);
    const count = completedItems.length;

    if (count === 0) {
      completedSection.classList.add('hidden');
    } else {
      completedSection.classList.remove('hidden');
      completedCount.textContent = `${count} completed item${count !== 1 ? 's' : ''}`;
    }
  }

  function renderItems() {
    const activeItems = items.filter(item => !item.checked);
    const completedItems = items.filter(item => item.checked);

    activeList.innerHTML = '';
    if (activeItems.length === 0 && completedItems.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty-message';
      empty.textContent = 'No items yet. Add one below!';
      activeList.appendChild(empty);
    } else {
      activeItems.forEach(item => {
        activeList.appendChild(renderItem(item));
      });
    }

    completedList.innerHTML = '';
    completedItems.forEach(item => {
      completedList.appendChild(renderItem(item));
    });

    updateCompletedSection();
  }

  async function loadItems() {
    try {
      const res = await fetch('/api/items');
      items = await res.json();
      renderItems();
    } catch (error) {
      console.error('Failed to load items:', error);
    }
  }

  async function addItem(text) {
    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (!res.ok) throw new Error('Failed to add item');
    } catch (error) {
      console.error('Failed to add item:', error);
    }
  }

  async function toggleItem(id) {
    try {
      const res = await fetch(`/api/items/${id}`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Failed to toggle item');
    } catch (error) {
      console.error('Failed to toggle item:', error);
    }
  }

  async function deleteItem(id) {
    const item = items.find(i => i.id === id);
    try {
      const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete item');
      deletedItem = item;
      showSnackbar();
    } catch (error) {
      console.error('Failed to delete item:', error);
    }
  }

  async function restoreItem() {
    if (!deletedItem) return;
    try {
      const res = await fetch('/api/items/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deletedItem)
      });
      if (!res.ok) throw new Error('Failed to restore item');
      deletedItem = null;
      hideSnackbar();
    } catch (error) {
      console.error('Failed to restore item:', error);
    }
  }

  async function reorderItems(draggedId, targetId) {
    const draggedIndex = items.findIndex(i => i.id === draggedId);
    const targetIndex = items.findIndex(i => i.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const [draggedItemObj] = items.splice(draggedIndex, 1);
    items.splice(targetIndex, 0, draggedItemObj);
    renderItems();

    const itemIds = items.map(i => i.id);
    try {
      const res = await fetch('/api/items/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds })
      });
      if (!res.ok) throw new Error('Failed to reorder items');
    } catch (error) {
      console.error('Failed to reorder items:', error);
      loadItems();
    }
  }

  function showSnackbar() {
    if (snackbarTimeout) clearTimeout(snackbarTimeout);
    snackbar.classList.add('show');
    snackbarTimeout = setTimeout(hideSnackbar, 5000);
  }

  function hideSnackbar() {
    snackbar.classList.remove('show');
    if (snackbarTimeout) {
      clearTimeout(snackbarTimeout);
      snackbarTimeout = null;
    }
  }

  snackbarUndo.addEventListener('click', restoreItem);

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = input.value.trim();
      if (text) {
        await addItem(text);
        input.value = '';
      }
    }
  });

  completedHeader.addEventListener('click', () => {
    completedSection.classList.toggle('collapsed');
  });

  // SSE
  function connectSSE() {
    const eventSource = new EventSource('/api/events');

    eventSource.addEventListener('connected', () => {
      console.log('SSE connected');
    });

    eventSource.addEventListener('item-added', (e) => {
      const item = JSON.parse(e.data);
      if (!items.find(i => i.id === item.id)) {
        items.push(item);
        renderItems();
        showNotification('Item Added', item.text);
      }
    });

    eventSource.addEventListener('item-updated', (e) => {
      const item = JSON.parse(e.data);
      const index = items.findIndex(i => i.id === item.id);
      if (index !== -1) {
        items[index] = item;
        renderItems();
      }
    });

    eventSource.addEventListener('item-deleted', (e) => {
      const item = JSON.parse(e.data);
      items = items.filter(i => i.id !== item.id);
      renderItems();
      showNotification('Item Deleted', item.text);
    });

    eventSource.addEventListener('items-reordered', (e) => {
      const { itemIds } = JSON.parse(e.data);
      const reordered = [];
      itemIds.forEach(id => {
        const item = items.find(i => i.id === id);
        if (item) reordered.push(item);
      });
      items.forEach(item => {
        if (!reordered.find(i => i.id === item.id)) {
          reordered.push(item);
        }
      });
      items = reordered;
      renderItems();
    });

    eventSource.onerror = () => {
      console.log('SSE connection lost, reconnecting...');
      eventSource.close();
      setTimeout(connectSSE, 3000);
    };
  }

  loadItems();
  connectSSE();
})();
