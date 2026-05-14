// overlay widget for displaying and navigating prompts

class PromptOverlay {
  constructor(adapter) {
    this.adapter = adapter;
    this.isExpanded = false;
    this.sortReversed = false;
    this.container = null;
    this.prompts = [];

    // Drag functionality
    this.isDragging = false;
    this.wasDragged = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.defaultPosition = { top: 20, left: 20 };
    this.currentX = 20;
    this.currentY = 20;
    this.pendingX = 0;
    this.pendingY = 0;
    this.rafId = null;
    this.dragThreshold = 5;

    this.init();
  }

  init() {
    this.createOverlay();
    this.loadPosition();
    this.attachEventListeners();
    this.attachDragListeners();
    this.updatePromptList();
  }

  createOverlay() {
    // Main container
    this.container = document.createElement("div");
    this.container.id = "llm-prompt-navigator-overlay";
    this.container.className = "lpn-overlay collapsed";

    // Collapsed state button
    const collapsedBtn = document.createElement("div");
    collapsedBtn.className = "lpn-collapsed-btn";
    collapsedBtn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    `;
    collapsedBtn.title = "ChatHop";

    // Expanded state container
    const expandedContainer = document.createElement("div");
    expandedContainer.className = "lpn-expanded-container";

    // Header
    const header = document.createElement("div");
    header.className = "lpn-header";
    header.innerHTML = `
      <div class="lpn-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
        <span>Prompts</span>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <button class="lpn-sort-btn" title="Toggle sort order">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M7 12h10M11 18h2"/>
          </svg>
        </button>
        <button class="lpn-close-btn" title="Collapse">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    `;

    // hint text for keyboard shortcut
    const hint = document.createElement("div");
    hint.className = "lpn-hint";
    hint.textContent = "Press Ctrl+Shift+H to hide";
    expandedContainer.appendChild(hint);

    // Tabs
    const tabs = document.createElement("div");
    tabs.className = "lpn-tabs";
    tabs.innerHTML = `
      <button class="lpn-tab active" data-tab="current">Current Chat</button>
      <button class="lpn-tab" data-tab="saved">Saved</button>
    `;

    // Content area
    const content = document.createElement("div");
    content.className = "lpn-content";

    // Current chat tab content
    const currentTab = document.createElement("div");
    currentTab.className = "lpn-tab-content active";
    currentTab.id = "lpn-current-tab";
    currentTab.innerHTML = '<div class="lpn-loading">Loading prompts...</div>';

    // Saved prompts tab content
    const savedTab = document.createElement("div");
    savedTab.className = "lpn-tab-content";
    savedTab.id = "lpn-saved-tab";
    savedTab.innerHTML =
      '<div class="lpn-loading">Loading saved prompts...</div>';

    content.appendChild(currentTab);
    content.appendChild(savedTab);

    expandedContainer.appendChild(header);
    expandedContainer.appendChild(tabs);
    expandedContainer.appendChild(content);

    this.container.appendChild(collapsedBtn);
    this.container.appendChild(expandedContainer);

    document.body.appendChild(this.container);
  }

  attachEventListeners() {
    // toggle overlay
    const collapsedBtn = this.container.querySelector(".lpn-collapsed-btn");
    const closeBtn = this.container.querySelector(".lpn-close-btn");
    const sortBtn = this.container.querySelector(".lpn-sort-btn");

    collapsedBtn.addEventListener("click", (e) => {
      if (!this.wasDragged) {
        this.expand();
      }
    });

    closeBtn.addEventListener("click", () => this.collapse());

    if (sortBtn) {
      sortBtn.addEventListener("click", () => this.toggleSort());
    }

    // tab switching
    const tabs = this.container.querySelectorAll(".lpn-tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => this.switchTab(tab.dataset.tab));
    });
  }

  attachDragListeners() {
    // Start drag from collapsed button or header
    const collapsedBtn = this.container.querySelector(".lpn-collapsed-btn");
    const header = this.container.querySelector(".lpn-header");

    collapsedBtn.addEventListener("mousedown", (e) => this.startDrag(e));
    if (header) {
      header.addEventListener("mousedown", (e) => this.startDrag(e));
    }

    // Drag movement and end
    document.addEventListener("mousemove", (e) => this.drag(e));
    document.addEventListener("mouseup", () => this.endDrag());
  }

  startDrag(e) {
    this.isDragging = true;
    this.wasDragged = false; // Reset drag flag on mouse down
    this.container.style.cursor = "grabbing";
    this.container.style.transition = "none";
    this.container.style.willChange = "transform";

    const rect = this.container.getBoundingClientRect();
    this.dragOffsetX = e.clientX - rect.left;
    this.dragOffsetY = e.clientY - rect.top;
    this.currentX = rect.left;
    this.currentY = rect.top;
  }

  drag(e) {
    if (!this.isDragging) return;

    this.pendingX = e.clientX - this.dragOffsetX;
    this.pendingY = e.clientY - this.dragOffsetY;

    // Check if mouse has moved beyond threshold - this is a real drag
    const deltaX = Math.abs(this.pendingX - this.currentX);
    const deltaY = Math.abs(this.pendingY - this.currentY);
    if (deltaX > this.dragThreshold || deltaY > this.dragThreshold) {
      this.wasDragged = true;
    }

    // Cancel previous animation frame if queued
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }

    // Queue update on next frame
    this.rafId = requestAnimationFrame(() => this.updateDragPosition());
  }

  updateDragPosition() {
    const width = this.container.offsetWidth;
    const height = this.container.offsetHeight;
    const maxLeft = window.innerWidth - width;
    const maxTop = window.innerHeight - height;

    this.currentX = Math.max(0, Math.min(this.pendingX, maxLeft));
    this.currentY = Math.max(0, Math.min(this.pendingY, maxTop));

    this.container.style.transform = `translate(${this.currentX}px, ${this.currentY}px)`;
    this.rafId = null;
  }

  endDrag() {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.container.style.cursor = "auto";
    this.container.style.willChange = "auto";
    this.container.style.transition = "";

    // Cancel pending animation frame
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    // Save position
    const position = {
      top: this.currentY,
      left: this.currentX,
    };
    this.savePosition(position);

    // Reset drag flag after a short delay to allow click event to be ignored
    setTimeout(() => {
      this.wasDragged = false;
    }, 50);
  }

  savePosition(position) {
    try {
      chrome.storage.local.set({ chathopOverlayPosition: position });
    } catch (e) {
      // Fallback for non-Chrome environments
      localStorage.setItem("chathopOverlayPosition", JSON.stringify(position));
    }
  }

  loadPosition() {
    try {
      chrome.storage.local.get("chathopOverlayPosition", (result) => {
        const position = result.chathopOverlayPosition || this.defaultPosition;
        this.applyPosition(position);
      });
    } catch (e) {
      // Fallback for non-Chrome environments
      const stored = localStorage.getItem("chathopOverlayPosition");
      const position = stored ? JSON.parse(stored) : this.defaultPosition;
      this.applyPosition(position);
    }
  }

  applyPosition(position) {
    this.currentX = position.left;
    this.currentY = position.top;
    this.container.style.position = "fixed";
    this.container.style.transform = `translate(${position.left}px, ${position.top}px)`;
  }

  expand() {
    this.isExpanded = true;
    this.container.classList.remove("collapsed");
    this.container.classList.add("expanded");
    this.updatePromptList();
    this.loadSavedPrompts();
  }

  collapse() {
    this.isExpanded = false;
    this.container.classList.remove("expanded");
    this.container.classList.add("collapsed");
  }

  toggleVisibility() {
    if (this.container.style.display === "none") {
      this.container.style.display = "";
    } else {
      this.container.style.display = "none";
    }
  }

  switchTab(tabName) {
    // Update tab buttons
    const tabs = this.container.querySelectorAll(".lpn-tab");
    tabs.forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.tab === tabName);
    });

    // Update tab contents
    const currentTab = this.container.querySelector("#lpn-current-tab");
    const savedTab = this.container.querySelector("#lpn-saved-tab");

    currentTab.classList.toggle("active", tabName === "current");
    savedTab.classList.toggle("active", tabName === "saved");

    if (tabName === "saved") {
      this.loadSavedPrompts();
    }
  }

  toggleSort() {
    this.sortReversed = !this.sortReversed;
    this.updatePromptList();
  }

  updatePromptList() {
    if (!this.adapter || !this.adapter.isOnChatPage()) {
      const currentTab = this.container.querySelector("#lpn-current-tab");
      currentTab.innerHTML = '<div class="lpn-empty">no chat detected</div>';
      return;
    }

    this.prompts = this.adapter.detectPrompts();
    const currentTab = this.container.querySelector("#lpn-current-tab");

    if (this.prompts.length === 0) {
      currentTab.innerHTML =
        '<div class="lpn-empty">no prompts found in this chat</div>';
      return;
    }

    const promptList = document.createElement("div");
    promptList.className = "lpn-prompt-list";

    const displayPrompts = this.sortReversed
      ? [...this.prompts].reverse()
      : this.prompts;

    displayPrompts.forEach((prompt, index) => {
      const item = this.createPromptItem(prompt, index);
      promptList.appendChild(item);
    });

    currentTab.innerHTML = "";
    currentTab.appendChild(promptList);
  }

  createPromptItem(prompt, index) {
    const item = document.createElement("div");
    item.className = "lpn-prompt-item";

    const content = document.createElement("div");
    content.className = "lpn-prompt-content";
    content.innerHTML = `
      <div class="lpn-prompt-number">#${index + 1}</div>
      <div class="lpn-prompt-preview">${this.escapeHtml(prompt.preview)}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "lpn-prompt-actions";

    const jumpBtn = document.createElement("button");
    jumpBtn.className = "lpn-action-btn";
    jumpBtn.title = "Jump to prompt";
    jumpBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M5 12h14m-7-7l7 7-7 7"/>
      </svg>
    `;
    jumpBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.adapter.scrollToPrompt(prompt.element);
      this.collapse();
    });

    const saveBtn = document.createElement("button");
    saveBtn.className = "lpn-action-btn";
    saveBtn.title = "Save prompt";
    saveBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
        <path d="M17 21v-8H7v8M7 3v5h8"/>
      </svg>
    `;
    saveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showSaveDialog(prompt, index);
    });

    actions.appendChild(jumpBtn);
    actions.appendChild(saveBtn);

    item.appendChild(content);
    item.appendChild(actions);

    // Click on item to jump to prompt
    item.addEventListener("click", () => {
      this.adapter.scrollToPrompt(prompt.element);
      this.collapse();
    });

    return item;
  }

  showSaveDialog(prompt, promptIndex) {
    const dialog = document.createElement("div");
    dialog.className = "lpn-dialog-overlay";

    const dialogContent = document.createElement("div");
    dialogContent.className = "lpn-dialog";
    dialogContent.innerHTML = `
      <h3>Save Prompt</h3>
      <div class="lpn-dialog-body">
        <label>
          <span>Title:</span>
          <input type="text" id="lpn-save-title" placeholder="Enter a descriptive title" value="Prompt #${promptIndex + 1}">
        </label>
        <div class="lpn-prompt-preview-box">
          <strong>Preview:</strong>
          <p>${this.escapeHtml(prompt.preview)}</p>
        </div>
      </div>
      <div class="lpn-dialog-actions">
        <button class="lpn-btn lpn-btn-secondary" id="lpn-cancel-save">Cancel</button>
        <button class="lpn-btn lpn-btn-primary" id="lpn-confirm-save">Save</button>
      </div>
    `;

    dialog.appendChild(dialogContent);
    document.body.appendChild(dialog);

    const titleInput = dialog.querySelector("#lpn-save-title");
    titleInput.focus();
    titleInput.select();

    dialog.querySelector("#lpn-cancel-save").addEventListener("click", () => {
      dialog.remove();
    });

    dialog
      .querySelector("#lpn-confirm-save")
      .addEventListener("click", async () => {
        const title = titleInput.value.trim() || `Prompt #${promptIndex + 1}`;
        await this.savePrompt(title, prompt, promptIndex);
        dialog.remove();
        this.showToast("Prompt saved successfully!");
      });

    // Close on overlay click
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) {
        dialog.remove();
      }
    });

    // Save on Enter
    titleInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        dialog.querySelector("#lpn-confirm-save").click();
      }
    });
  }

  async savePrompt(title, prompt, promptIndex) {
    const chatId = this.adapter.getChatId();
    const url = this.adapter.getCurrentUrl();
    const site = this.adapter.getSiteName();

    await window.StorageUtils.savePrompt({
      title,
      site,
      chatId,
      promptIndex,
      url,
      text: prompt.text,
    });
  }

  async loadSavedPrompts() {
    const savedTab = this.container.querySelector("#lpn-saved-tab");
    const savedPrompts = await window.StorageUtils.getSavedPrompts();

    if (savedPrompts.length === 0) {
      savedTab.innerHTML = '<div class="lpn-empty">No saved prompts yet</div>';
      return;
    }

    const promptList = document.createElement("div");
    promptList.className = "lpn-prompt-list";

    // Sort by timestamp (newest first)
    savedPrompts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    savedPrompts.forEach((savedPrompt) => {
      const item = this.createSavedPromptItem(savedPrompt);
      promptList.appendChild(item);
    });

    savedTab.innerHTML = "";
    savedTab.appendChild(promptList);
  }

  createSavedPromptItem(savedPrompt) {
    const item = document.createElement("div");
    item.className = "lpn-prompt-item lpn-saved-item";

    const content = document.createElement("div");
    content.className = "lpn-prompt-content";

    const preview = savedPrompt.text
      ? this.escapeHtml(
          savedPrompt.text.substring(0, 100) +
            (savedPrompt.text.length > 100 ? "..." : ""),
        )
      : "No preview available";

    content.innerHTML = `
      <div class="lpn-saved-header">
        <div class="lpn-saved-title">${this.escapeHtml(savedPrompt.title)}</div>
        <div class="lpn-saved-site">${this.escapeHtml(savedPrompt.site)}</div>
      </div>
      <div class="lpn-prompt-preview">${preview}</div>
      <div class="lpn-saved-meta">
        <span>${new Date(savedPrompt.timestamp).toLocaleDateString()}</span>
      </div>
    `;

    const actions = document.createElement("div");
    actions.className = "lpn-prompt-actions";

    const openBtn = document.createElement("button");
    openBtn.className = "lpn-action-btn";
    openBtn.title = "Open";
    openBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6m4-3h6v6m-11 5L21 3"/>
      </svg>
    `;
    openBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      window.open(savedPrompt.url, "_blank");
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "lpn-action-btn lpn-delete-btn";
    deleteBtn.title = "Delete";
    deleteBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 6h18m-2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
      </svg>
    `;
    deleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm("Delete this saved prompt?")) {
        await window.StorageUtils.deletePrompt(savedPrompt.id);
        this.loadSavedPrompts();
        this.showToast("Prompt deleted");
      }
    });

    actions.appendChild(openBtn);
    actions.appendChild(deleteBtn);

    item.appendChild(content);
    item.appendChild(actions);

    // Click to open
    item.addEventListener("click", () => {
      window.open(savedPrompt.url, "_blank");
    });

    return item;
  }

  showToast(message) {
    const toast = document.createElement("div");
    toast.className = "lpn-toast";
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add("show"), 100);
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  refresh() {
    if (this.isExpanded) {
      this.updatePromptList();
    }
  }
}

// make available globally
if (typeof window !== "undefined") {
  window.PromptOverlay = PromptOverlay;
}
