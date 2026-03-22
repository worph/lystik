(function() {
  const input = document.getElementById('item-input');
  const activeList = document.getElementById('items-active');
  const completedList = document.getElementById('items-completed');
  const completedSection = document.getElementById('completed-section');
  const completedHeader = document.getElementById('completed-header');
  const completedCount = document.getElementById('completed-count');
  const snackbar = document.getElementById('snackbar');
  const snackbarUndo = document.getElementById('snackbar-undo');
  const installBtn = document.getElementById('install-btn');

  let items = [];
  let deletedItem = null;
  let snackbarTimeout = null;
  let draggedItem = null;
  let deferredPrompt = null;

  // Auth redirect detection
  function isAuthRedirect(response) {
    return response.redirected && response.url.includes('/login');
  }

  function showAuthError() {
    activeList.innerHTML = '';
    const error = document.createElement('li');
    error.className = 'empty-message error-message';
    error.textContent = 'Authentication required. Please refresh or log in.';
    activeList.appendChild(error);
  }

  // PWA Install handling
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  if (isStandalone) {
    // Already installed, hide the button
    installBtn.classList.add('hidden');
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.disabled = false;
  });

  window.addEventListener('appinstalled', () => {
    installBtn.classList.add('hidden');
    deferredPrompt = null;
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      installBtn.classList.add('hidden');
    }
    deferredPrompt = null;
    installBtn.disabled = true;
  });

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
      if (isAuthRedirect(res)) {
        showAuthError();
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      items = await res.json();
      renderItems();
    } catch (error) {
      console.error('Failed to load items:', error);
      showAuthError();
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
      const item = await res.json();
      items.push(item);
      renderItems();
    } catch (error) {
      console.error('Failed to add item:', error);
    }
  }

  async function toggleItem(id) {
    try {
      const res = await fetch(`/api/items/${id}`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Failed to toggle item');
      const updated = await res.json();
      const index = items.findIndex(i => i.id === id);
      if (index !== -1) items[index] = updated;
      renderItems();
    } catch (error) {
      console.error('Failed to toggle item:', error);
    }
  }

  async function deleteItem(id) {
    const item = items.find(i => i.id === id);
    try {
      const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete item');
      items = items.filter(i => i.id !== id);
      renderItems();
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
      const item = await res.json();
      items.push(item);
      renderItems();
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

  loadItems();

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('Service Worker registered:', registration.scope);
      })
      .catch((error) => {
        console.error('Service Worker registration failed:', error);
      });
  }
})();
