import { Bot, Braces, ClipboardList, FileText, Lightbulb, Send, Sparkles, Wand2 } from 'lucide-react';

const suggestions = ['为三江源生成 Landsat 下载参数', '推荐无缝镶嵌流程', '生成 A3 横版专题图布局'];

type AiAssistantPanelProps = {
  isCollapsed: boolean;
};

export function AiAssistantPanel({ isCollapsed }: AiAssistantPanelProps) {
  return (
    <aside aria-hidden={isCollapsed} className={isCollapsed ? 'ai-panel collapsed' : 'ai-panel'}>
      <div className="panel-header">
        <div>
          <p className="eyebrow">AI Copilot</p>
          <h2>GIS 智能助手</h2>
        </div>
        <button className="icon-button dark" aria-label="新建对话">
          <Sparkles size={18} />
        </button>
      </div>

      <section className="assistant-card">
        <div className="assistant-avatar">
          <Bot size={22} />
        </div>
        <div>
          <strong>制图策略已就绪</strong>
          <p>当前 AOI 可优先检索 Sentinel-2 L2A，并用 Landsat 9 补充低云覆盖窗口。</p>
        </div>
      </section>

      <section className="ai-tool-grid" aria-label="AI 工具">
        <button>
          <Wand2 size={18} />
          参数生成
        </button>
        <button>
          <ClipboardList size={18} />
          任务诊断
        </button>
        <button>
          <FileText size={18} />
          制图方案
        </button>
        <button>
          <Braces size={18} />
          脚本草稿
        </button>
      </section>

      <section className="insight-list">
        <div className="section-heading">
          <h3>推荐动作</h3>
          <button>全部</button>
        </div>
        {suggestions.map((suggestion) => (
          <button className="insight-item" key={suggestion}>
            <Lightbulb size={16} />
            <span>{suggestion}</span>
          </button>
        ))}
      </section>

      <section className="chat-thread">
        <div className="message assistant">
          <span>AI</span>
          <p>我可以根据 AOI、时间窗、云量和目标比例尺生成完整下载任务。</p>
        </div>
        <div className="message user">
          <span>你</span>
          <p>优先选择云量低于 20% 的 2026 年夏季影像。</p>
        </div>
        <div className="message assistant">
          <span>AI</span>
          <p>建议先检索 Sentinel-2 L2A，再用 Landsat 9 对缺口区域补片。</p>
        </div>
      </section>

      <form className="composer">
        <input aria-label="输入 GIS 问题" placeholder="输入 GIS 问题或制图目标" />
        <button aria-label="发送" type="button">
          <Send size={17} />
        </button>
      </form>
    </aside>
  );
}
