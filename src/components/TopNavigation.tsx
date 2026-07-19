import { Bell, Cloud, Database, Map, Search, Settings, ShieldCheck } from 'lucide-react';

export function TopNavigation() {
  return (
    <header className="top-navigation">
      <div className="brand-cluster">
        <div className="brand-mark" aria-hidden="true">
          <Map size={22} strokeWidth={2.2} />
        </div>
        <div>
          <h1>GYY Carto</h1>
          <span>遥感数据与智能制图系统</span>
        </div>
      </div>

      <div className="top-actions">
        <div className="global-search">
          <Search size={16} />
          <input aria-label="搜索项目、影像或任务" placeholder="搜索项目、影像或任务" />
        </div>
        <button className="icon-button" aria-label="云端状态">
          <Cloud size={18} />
        </button>
        <button className="icon-button" aria-label="数据资产">
          <Database size={18} />
        </button>
        <button className="icon-button" aria-label="通知">
          <Bell size={18} />
        </button>
        <button className="icon-button" aria-label="系统设置">
          <Settings size={18} />
        </button>
        <div className="tenant-badge">
          <ShieldCheck size={16} />
          <span>Enterprise</span>
        </div>
      </div>
    </header>
  );
}
