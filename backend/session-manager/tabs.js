class TabManager {
  constructor() {
    this.tabs = []; // array of tabIds
    this.activeTab = null;
  }

  createTab() {
    const id = "tab_" + Math.random().toString(16).slice(2, 8);
    this.tabs.push(id);
    if (!this.activeTab) this.activeTab = id;
    return id;
  }

  closeTab(tabId) {
    this.tabs = this.tabs.filter(t => t !== tabId);
    if (this.activeTab === tabId) {
      this.activeTab = this.tabs[0] || null;
    }
  }

  switchTab(tabId) {
    if (this.tabs.includes(tabId)) {
      this.activeTab = tabId;
    }
  }

  toJSON() {
    return {
      tabs: this.tabs,
      activeTab: this.activeTab
    };
  }
}

module.exports = { TabManager };