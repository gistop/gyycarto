import { useState } from 'react';
import {
  Archive,
  CheckCircle2,
  ChevronRight,
  Compass,
  Download,
  Eye,
  EyeOff,
  FileImage,
  Folder,
  FolderOpen,
  Grid2X2,
  Hand,
  Layers3,
  MapPinned,
  MousePointer2,
  PackageCheck,
  Ruler,
  RotateCcw,
  Scissors,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { getSearchResultKey, type MpcSearchResult, type SearchProviderId } from '../../types/search';
import { TILE_OFFSET_MAX, TILE_OFFSET_MIN } from '../map/MapCanvas';
import { layoutPaperPresets, type LayoutAdornmentId, type LayoutPaperId, type LayoutTool } from '../map/layoutConfig';

type SearchSourceNode = {
  id?: string;
  name: string;
  meta?: string;
  children?: SearchSourceNode[];
};

type SearchProviderResponse = {
  collection: string;
  error: string | null;
  matched?: number;
  provider: SearchProviderId;
  providerName: string;
  returned: number;
  results: MpcSearchResult[];
  truncated: boolean;
};

type MpcSearchResponse = {
  bbox: readonly number[];
  cloudCoverMax: number;
  datetime: string;
  maxResults: number;
  providers?: Record<SearchProviderId, SearchProviderResponse>;
  error?: string;
  message?: string;
};

const RESULT_PAGE_SIZE = 8;
const MAX_SEARCH_RESULTS = 500;

const searchProviderOptions: Array<{ id: SearchProviderId; label: string }> = [
  { id: 'mpc', label: 'Microsoft MPC' },
  { id: 'earth-search', label: 'Element 84 / Earth Search' },
];

const sourceCategories: SearchSourceNode[] = [
  {
    name: '遥感影像',
    children: [
      { id: 'landsat-c2', name: 'Landsat', meta: 'Collection 2 SR' },
      { id: 'sentinel-2', name: 'Sentinel-2', meta: '10 m · L2A' },
      { id: 'modis', name: 'MODIS', meta: '250 m / 500 m' },
      { id: 'viirs', name: 'VIIRS 夜光', meta: '500 m' },
    ],
  },
  {
    name: '地形数据',
    children: [
      { id: 'srtm-dem', name: 'SRTM DEM', meta: '30 m' },
      { id: 'aster-gdem', name: 'ASTER GDEM', meta: '30 m' },
      { id: 'copernicus-dem', name: 'Copernicus DEM', meta: '30 m / 90 m' },
    ],
  },
  {
    name: '基础地理',
    children: [
      { id: 'admin-boundary', name: '行政区划', meta: '省 / 市 / 县' },
      { id: 'hydrology', name: '水系', meta: '河流 / 湖泊' },
      { id: 'roads', name: '道路', meta: 'OSM / 天地图' },
      { id: 'settlements', name: '居民地', meta: '城镇 / 村庄' },
    ],
  },
  {
    name: '专题数据',
    children: [
      { id: 'land-cover', name: '土地覆盖', meta: 'GlobeLand30 / ESA' },
      { id: 'ndvi', name: 'NDVI 植被指数', meta: 'MODIS / Sentinel' },
      { id: 'era5', name: 'ERA5 气象', meta: '逐小时 / 月尺度' },
      { id: 'worldpop', name: '人口数据', meta: 'WorldPop / GHSL' },
    ],
  },
];

const workflowTabs = [
  {
    id: 'data',
    label: '数据',
    icon: Layers3,
    description: '管理项目数据、基础地理数据和已归档成果。',
    items: ['项目数据', '基础数据', '影像目录', '矢量图层', '栅格数据', '元数据'],
  },
  {
    id: 'processing',
    label: '处理',
    icon: Scissors,
    description: '管理裁剪、镶嵌、重采样和质量检查任务。',
    items: ['裁剪范围', '无缝镶嵌', '重采样规则', '波段组合', '色彩平衡', '质量检查'],
  },
  {
    id: 'cartography',
    label: '制图',
    icon: FileImage,
    description: '配置版式、地图整饰和导出格式。',
    items: ['版式模板', '比例尺', '指北针', '图例', '标注系统', '导出任务'],
  },
  {
    id: 'search',
    label: '检索',
    icon: Search,
    description: '检索 Landsat、Sentinel 与辅助数据，建立下载清单。',
    items: ['范围绘制', '数据源选择', '时间窗口', '云量阈值', '结果预览', '下载清单'],
  },
] as const;

export type WorkflowTabId = (typeof workflowTabs)[number]['id'];

type DataTreeNode = {
  name: string;
  meta?: string;
  children?: DataTreeNode[];
};

const userDataTree: DataTreeNode[] = [
  {
    name: '三江源项目库',
    meta: '项目',
    children: [
      { name: 'AOI_三江源.geojson', meta: '边界' },
      { name: 'Landsat_2026_01', meta: '32 景' },
      { name: 'Sentinel_2026_Q2', meta: '84 景' },
    ],
  },
  {
    name: '基础地理数据',
    meta: '共享',
    children: [
      { name: '行政区划_青海.shp', meta: '矢量' },
      { name: 'DEM_30m.tif', meta: '栅格' },
      { name: '水系_河流.gpkg', meta: '矢量' },
    ],
  },
];

type LeftOperationsPanelProps = {
  activeTab: WorkflowTabId;
  activeLayoutAdornmentIds: LayoutAdornmentId[];
  isCollapsed: boolean;
  layoutMapZoom: number;
  layoutTool: LayoutTool;
  layoutTileZoom: number;
  layoutZoom: number;
  onActiveTabChange: (tabId: WorkflowTabId) => void;
  onLayoutMapZoomChange: (zoom: number) => void;
  onLayoutToolChange: (tool: LayoutTool) => void;
  onLayoutTileZoomChange: (zoom: number) => void;
  onLayoutZoomChange: (zoom: number) => void;
  onPaperSizeChange: (paperId: LayoutPaperId) => void;
  onResetVisibleResults: () => void;
  onExportLayout: () => void;
  onToggleLayoutAdornment: (adornmentId: LayoutAdornmentId) => void;
  onToggleResultOnMap: (result: MpcSearchResult) => void;
  paperSize: LayoutPaperId;
  visibleResultIds: string[];
};

export function LeftOperationsPanel({
  activeTab,
  activeLayoutAdornmentIds,
  isCollapsed,
  layoutMapZoom,
  layoutTool,
  layoutTileZoom,
  layoutZoom,
  onActiveTabChange,
  onLayoutMapZoomChange,
  onLayoutToolChange,
  onLayoutTileZoomChange,
  onLayoutZoomChange,
  onPaperSizeChange,
  onResetVisibleResults,
  onExportLayout,
  onToggleLayoutAdornment,
  onToggleResultOnMap,
  paperSize,
  visibleResultIds,
}: LeftOperationsPanelProps) {
  const selectedTab = workflowTabs.find((tab) => tab.id === activeTab) ?? workflowTabs[0];

  return (
    <aside aria-hidden={isCollapsed} className={isCollapsed ? 'operations-panel collapsed' : 'operations-panel'}>
      <div className="operations-panel-content">
        <div className="workflow-tabs" role="tablist" aria-label="生产流程">
          {workflowTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;

            return (
              <button
                aria-selected={isActive}
                className={isActive ? 'workflow-tab active' : 'workflow-tab'}
                key={tab.id}
                onClick={() => onActiveTabChange(tab.id)}
                role="tab"
                type="button"
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {activeTab === 'data' && <DataWorkspace />}

        {activeTab === 'search' && (
          <SearchWorkspace
            onResetVisibleResults={onResetVisibleResults}
            onToggleResultOnMap={onToggleResultOnMap}
            visibleResultIds={visibleResultIds}
          />
        )}

        {activeTab === 'cartography' && (
          <CartographyWorkspace
            layoutMapZoom={layoutMapZoom}
            layoutTool={layoutTool}
            layoutTileZoom={layoutTileZoom}
            layoutZoom={layoutZoom}
            onExportLayout={onExportLayout}
            onLayoutMapZoomChange={onLayoutMapZoomChange}
            onLayoutToolChange={onLayoutToolChange}
            onLayoutTileZoomChange={onLayoutTileZoomChange}
            onLayoutZoomChange={onLayoutZoomChange}
            onPaperSizeChange={onPaperSizeChange}
            paperSize={paperSize}
          />
        )}

        {activeTab !== 'data' && activeTab !== 'search' && activeTab !== 'cartography' && (
          <WorkflowPanel selectedTab={selectedTab} />
        )}

        {activeTab === 'cartography' ? (
          <LayoutAdornmentTools
            activeLayoutAdornmentIds={activeLayoutAdornmentIds}
            onToggleLayoutAdornment={onToggleLayoutAdornment}
          />
        ) : (
          <TaskSummary />
        )}

      </div>
    </aside>
  );
}

function LayoutAdornmentTools({
  activeLayoutAdornmentIds,
  onToggleLayoutAdornment,
}: {
  activeLayoutAdornmentIds: LayoutAdornmentId[];
  onToggleLayoutAdornment: (adornmentId: LayoutAdornmentId) => void;
}) {
  const adornments: Array<{ id: LayoutAdornmentId; label: string; meta: string; icon: typeof Compass }> = [
    { id: 'north-arrow', label: '指北针', meta: '插入地图', icon: Compass },
    { id: 'scale-bar', label: '比例尺', meta: '插入地图', icon: Ruler },
  ];

  return (
    <section className="task-summary layout-insert-tools" aria-label="地图整饰插入">
      {adornments.map((adornment) => {
        const Icon = adornment.icon;
        const isActive = activeLayoutAdornmentIds.includes(adornment.id);

        return (
          <button
            aria-pressed={isActive}
            className={isActive ? 'summary-item layout-insert-item active' : 'summary-item layout-insert-item'}
            key={adornment.id}
            onClick={() => onToggleLayoutAdornment(adornment.id)}
            type="button"
          >
            <Icon size={18} />
            <span>{adornment.meta}</span>
            <strong>{adornment.label}</strong>
          </button>
        );
      })}
    </section>
  );
}

function TaskSummary() {
  return (
    <section className="task-summary">
      <div className="summary-item">
        <PackageCheck size={17} />
        <span>候选影像</span>
        <strong>128</strong>
      </div>
      <div className="summary-item">
        <Archive size={17} />
        <span>下载队列</span>
        <strong>12</strong>
      </div>
      <div className="summary-item">
        <CheckCircle2 size={17} />
        <span>已归档</span>
        <strong>48</strong>
      </div>
      <div className="summary-item">
        <Grid2X2 size={17} />
        <span>待镶嵌</span>
        <strong>6</strong>
      </div>
    </section>
  );
}

function CartographyWorkspace({
  layoutMapZoom,
  layoutTool,
  layoutTileZoom,
  layoutZoom,
  onExportLayout,
  onLayoutMapZoomChange,
  onLayoutToolChange,
  onLayoutTileZoomChange,
  onLayoutZoomChange,
  onPaperSizeChange,
  paperSize,
}: {
  layoutMapZoom: number;
  layoutTool: LayoutTool;
  layoutTileZoom: number;
  layoutZoom: number;
  onExportLayout: () => void;
  onLayoutMapZoomChange: (zoom: number) => void;
  onLayoutToolChange: (tool: LayoutTool) => void;
  onLayoutTileZoomChange: (zoom: number) => void;
  onLayoutZoomChange: (zoom: number) => void;
  onPaperSizeChange: (paperId: LayoutPaperId) => void;
  paperSize: LayoutPaperId;
}) {
  const setMapZoom = (zoom: number) => onLayoutMapZoomChange(Math.min(19, Math.max(2, Math.round(zoom))));
  const setZoom = (zoom: number) => onLayoutZoomChange(Math.min(180, Math.max(50, zoom)));
  const minTileOffset = Math.max(TILE_OFFSET_MIN, -layoutMapZoom);
  const setTileZoom = (zoom: number) =>
    onLayoutTileZoomChange(Math.min(TILE_OFFSET_MAX, Math.max(minTileOffset, Math.round(zoom))));
  const tileOffsetLabel = `Z${layoutTileZoom > 0 ? `+${layoutTileZoom}` : layoutTileZoom}`;

  return (
    <div className="data-workspace">
      <section className="cartography-panel">
        <div className="section-heading">
          <h3>版面导航</h3>
          <button
            onClick={() => {
              onLayoutToolChange('select');
              onLayoutZoomChange(100);
            }}
            type="button"
          >
            重置
          </button>
        </div>

        <div className="layout-tool-grid">
          <button
            className={layoutTool === 'select' ? 'layout-tool-button active' : 'layout-tool-button'}
            onClick={() => onLayoutToolChange('select')}
            type="button"
          >
            <MousePointer2 size={16} />
            <span>选择</span>
          </button>
          <button
            className={layoutTool === 'pan' ? 'layout-tool-button active' : 'layout-tool-button'}
            onClick={() => onLayoutToolChange('pan')}
            type="button"
          >
            <Hand size={16} />
            <span>平移纸张</span>
          </button>
        </div>

        <div className="layout-zoom-row">
          <button aria-label="缩小纸张" onClick={() => setZoom(layoutZoom - 10)} type="button">
            <ZoomOut size={16} />
          </button>
          <input
            aria-label="纸张缩放"
            max="180"
            min="50"
            onChange={(event) => setZoom(Number(event.currentTarget.value))}
            type="range"
            value={layoutZoom}
          />
          <button aria-label="放大纸张" onClick={() => setZoom(layoutZoom + 10)} type="button">
            <ZoomIn size={16} />
          </button>
          <strong>{layoutZoom}%</strong>
        </div>

        <button className="layout-reset-view" onClick={() => setZoom(100)} type="button">
          <RotateCcw size={16} />
          <span>缩放到 100%</span>
        </button>

        <div className="layout-tile-zoom-row">
          <span>地图缩放</span>
          <button aria-label="缩小图框内地图" onClick={() => setMapZoom(layoutMapZoom - 1)} type="button">
            <ZoomOut size={16} />
          </button>
          <input
            aria-label="图框内地图缩放"
            max="19"
            min="2"
            onChange={(event) => setMapZoom(Number(event.currentTarget.value))}
            step="1"
            type="number"
            value={layoutMapZoom}
          />
          <button aria-label="放大图框内地图" onClick={() => setMapZoom(layoutMapZoom + 1)} type="button">
            <ZoomIn size={16} />
          </button>
        </div>

        <div className="layout-tile-zoom-row">
          <span>瓦片级数</span>
          <button title="降低取样级数，地理范围不变" aria-label="降低瓦片级数" onClick={() => setTileZoom(layoutTileZoom - 1)} type="button">
            <ZoomOut size={16} />
          </button>
          <input
            aria-label="瓦片级数"
            readOnly
            title={tileOffsetLabel}
            type="text"
            value={tileOffsetLabel}
          />
          <button title="提高取样级数，地理范围不变" aria-label="提高瓦片级数" onClick={() => setTileZoom(layoutTileZoom + 1)} type="button">
            <ZoomIn size={16} />
          </button>
        </div>

        <button className="layout-reset-view layout-export-jpg" onClick={onExportLayout} type="button">
          <Download size={16} />
          <span>导出 JPG 300dpi</span>
        </button>
      </section>

      <section className="cartography-panel">
        <div className="section-heading">
          <h3>纸张尺寸</h3>
        </div>
        <div className="paper-size-grid">
          {layoutPaperPresets.map((paper) => (
            <button
              className={paperSize === paper.id ? 'paper-size-button active' : 'paper-size-button'}
              key={paper.id}
              onClick={() => onPaperSizeChange(paper.id)}
              type="button"
            >
              <span>{paper.shortLabel}</span>
              <strong>
                {paper.widthMm} x {paper.heightMm} mm
              </strong>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function WorkflowPanel({ selectedTab }: { selectedTab: (typeof workflowTabs)[number] }) {
  const SelectedIcon = selectedTab.icon;

  return (
    <section className="workflow-panel" aria-labelledby="workflow-panel-title">
      <div className="workflow-panel-title">
        <div>
          <SelectedIcon size={18} />
          <h3 id="workflow-panel-title">{selectedTab.label}工作区</h3>
        </div>
        <span>{selectedTab.items.length} 项</span>
      </div>
      <p>{selectedTab.description}</p>
      <div className="workflow-items">
        {selectedTab.items.map((item) => (
          <button key={item} type="button">
            {item}
          </button>
        ))}
      </div>
    </section>
  );
}

function DataWorkspace() {
  return (
    <div className="data-workspace">
      <section className="data-tree-panel">
        <div className="section-heading">
          <h3>我的数据</h3>
          <button type="button">导入</button>
        </div>
        <ul className="data-tree">
          {userDataTree.map((node) => (
            <DataTreeItem key={node.name} node={node} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function SearchWorkspace({
  onResetVisibleResults,
  onToggleResultOnMap,
  visibleResultIds,
}: {
  onResetVisibleResults: () => void;
  onToggleResultOnMap: (result: MpcSearchResult) => void;
  visibleResultIds: string[];
}) {
  const [selectedSources, setSelectedSources] = useState(['sentinel-2']);
  const [selectedProvider, setSelectedProvider] = useState<SearchProviderId>('mpc');
  const [sourceQuery, setSourceQuery] = useState('');
  const [isSourceDialogOpen, setIsSourceDialogOpen] = useState(false);
  const [locationMode, setLocationMode] = useState<'polygon' | 'coordinates'>('polygon');
  const [longitudeRange, setLongitudeRange] = useState('121.342691, 121.563309');
  const [latitudeRange, setLatitudeRange] = useState('31.067863, 31.294137');
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState('2026-07-18');
  const [cloudLimit, setCloudLimit] = useState(20);
  const [searchResponses, setSearchResponses] = useState<Record<SearchProviderId, SearchProviderResponse | null>>({
    'earth-search': null,
    mpc: null,
  });
  const [searchError, setSearchError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const filteredSourceTree = sourceCategories
    .map((category) => filterSourceNode(category, sourceQuery))
    .filter((category): category is SearchSourceNode => Boolean(category));
  const searchResponse = searchResponses[selectedProvider];
  const hasSearchResponses = Object.values(searchResponses).some(Boolean);
  const searchResults = searchResponse?.results ?? [];
  const pageCount = Math.max(1, Math.ceil(searchResults.length / RESULT_PAGE_SIZE));
  const pageResults = searchResults.slice((currentPage - 1) * RESULT_PAGE_SIZE, currentPage * RESULT_PAGE_SIZE);

  const toggleSource = (sourceId: string) => {
    setSelectedSources((current) =>
      current.includes(sourceId) ? current.filter((id) => id !== sourceId) : [...current, sourceId],
    );
  };

  const searchStac = async () => {
    setSearchError('');
    setSearchResponses({
      'earth-search': null,
      mpc: null,
    });
    setCurrentPage(1);
    onResetVisibleResults();

    try {
      const longitude = parseRangeInput(longitudeRange, '经度', -180, 180);
      const latitude = parseRangeInput(latitudeRange, '纬度', -90, 90);

      if (startDate > endDate) {
        throw new Error('开始日期不能晚于结束日期');
      }

      setIsSearching(true);

      const response = await fetch('/api/mpc/search', {
        body: JSON.stringify({
          bbox: [longitude[0], latitude[0], longitude[1], latitude[1]],
          cloudCoverMax: cloudLimit,
          datetime: {
            end: endDate,
            start: startDate,
          },
          maxResults: MAX_SEARCH_RESULTS,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      const payload = (await response.json()) as MpcSearchResponse;

      if (!response.ok || payload.error) {
        throw new Error(payload.message || 'STAC 检索失败');
      }

      setSearchResponses({
        'earth-search': payload.providers?.['earth-search'] ?? null,
        mpc: payload.providers?.mpc ?? null,
      });
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'STAC 检索失败');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="data-workspace">
      <section className="data-search-panel">
        <div className="section-heading">
          <h3>网络数据检索</h3>
          <button
            onClick={() => {
              setSelectedSources(['sentinel-2']);
              setSelectedProvider('mpc');
              setSourceQuery('');
              setIsSourceDialogOpen(false);
              setLocationMode('polygon');
              setLongitudeRange('121.342691, 121.563309');
              setLatitudeRange('31.067863, 31.294137');
              setStartDate('2026-01-01');
              setEndDate('2026-07-18');
              setCloudLimit(20);
              setSearchResponses({
                'earth-search': null,
                mpc: null,
              });
              setSearchError('');
              setCurrentPage(1);
              onResetVisibleResults();
            }}
            type="button"
          >
            重置
          </button>
        </div>

        <div className="source-picker-summary">
          <button className="source-picker-button" onClick={() => setIsSourceDialogOpen(true)} type="button">
            <Layers3 size={16} />
            选择数据源
          </button>
          <span>{selectedSources.length} 个数据源已选择</span>
        </div>

        {isSourceDialogOpen && (
          <div className="source-dialog-backdrop" onClick={() => setIsSourceDialogOpen(false)}>
            <div
              aria-labelledby="source-dialog-title"
              aria-modal="true"
              className="source-dialog"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="source-dialog-header">
                <h3 id="source-dialog-title">选择数据源</h3>
                <button aria-label="关闭数据源选择" className="dialog-close" onClick={() => setIsSourceDialogOpen(false)} type="button">
                  <X size={17} />
                </button>
              </div>

              <div className="source-dialog-body">
                <div className="source-browser">
                  <label className="source-search">
                    <Search size={15} />
                    <input
                      aria-label="搜索数据源"
                      onChange={(event) => setSourceQuery(event.currentTarget.value)}
                      placeholder="搜索数据源"
                      value={sourceQuery}
                    />
                  </label>

                  <ul className="source-tree">
                    {filteredSourceTree.map((node) => (
                      <SourceTreeItem
                        key={node.name}
                        node={node}
                        selectedSources={selectedSources}
                        toggleSource={toggleSource}
                      />
                    ))}
                  </ul>

                  <div className="source-selection-summary">
                    <strong>{selectedSources.length}</strong>
                    <span>个数据源已选择</span>
                  </div>
                </div>
              </div>

              <div className="source-dialog-footer">
                <button onClick={() => setIsSourceDialogOpen(false)} type="button">
                  完成
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="field-group">
          <span>位置</span>
          <div className="location-mode-grid">
            <button
              className={locationMode === 'polygon' ? 'field-button active' : 'field-button'}
              onClick={() => setLocationMode('polygon')}
              type="button"
            >
              <MousePointer2 size={16} />
              绘制多边形
            </button>
            <button
              className={locationMode === 'coordinates' ? 'field-button active' : 'field-button'}
              onClick={() => setLocationMode('coordinates')}
              type="button"
            >
              <MapPinned size={16} />
              输入经纬度
            </button>
          </div>
        </div>

        <div className="coordinate-grid">
          <label className="field-group">
            <span>经度</span>
            <input
              className="text-field"
              onChange={(event) => setLongitudeRange(event.currentTarget.value)}
              value={longitudeRange}
            />
          </label>
          <label className="field-group">
            <span>纬度</span>
            <input
              className="text-field"
              onChange={(event) => setLatitudeRange(event.currentTarget.value)}
              value={latitudeRange}
            />
          </label>
        </div>

        <div className="date-grid">
          <label className="field-group">
            <span>开始日期</span>
            <input
              className="text-field"
              onChange={(event) => setStartDate(event.currentTarget.value)}
              type="date"
              value={startDate}
            />
          </label>
          <label className="field-group">
            <span>结束日期</span>
            <input
              className="text-field"
              onChange={(event) => setEndDate(event.currentTarget.value)}
              type="date"
              value={endDate}
            />
          </label>
        </div>

        <label className="field-group">
          <span>云量</span>
          <div className="slider-row">
            <input
              aria-label="云量"
              max="80"
              min="0"
              onChange={(event) => setCloudLimit(Number(event.currentTarget.value))}
              type="range"
              value={cloudLimit}
            />
            <strong>≤ {cloudLimit}%</strong>
          </div>
        </label>

        <button
          className="search-action"
          disabled={isSearching || !selectedSources.includes('sentinel-2')}
          onClick={searchStac}
          type="button"
        >
          <Download size={17} />
          {isSearching ? '正在检索 STAC' : '检索网络数据'}
        </button>

        {searchError && <div className="search-error">{searchError}</div>}

        {hasSearchResponses && (
          <div className="search-results">
            <div className="result-provider-tabs" aria-label="切换结果目录">
              {searchProviderOptions.map((provider) => {
                const providerResponse = searchResponses[provider.id];

                return (
                  <button
                    className={selectedProvider === provider.id ? 'field-button active' : 'field-button'}
                    key={provider.id}
                    onClick={() => {
                      setSelectedProvider(provider.id);
                      setCurrentPage(1);
                      onResetVisibleResults();
                    }}
                    type="button"
                  >
                    <span>{provider.label}</span>
                    <strong>{providerResponse ? providerResponse.returned : 0}</strong>
                  </button>
                );
              })}
            </div>

            {searchResponse?.error && <div className="search-error">{searchResponse.error}</div>}

            {searchResponse && (
              <>
            <div className="result-summary">
              <strong>{searchResponse.returned}</strong>
              <span>
                {searchResponse.providerName} ·
                条候选数据{typeof searchResponse.matched === 'number' ? ` / 匹配 ${searchResponse.matched} 条` : ''}
                {searchResponse.truncated ? `，已显示前 ${MAX_SEARCH_RESULTS} 条` : ''}
              </span>
            </div>
            <div className="result-list">
              {pageResults.length > 0 ? (
                pageResults.map((result) => {
                  const resultKey = getSearchResultKey(result);
                  const isVisible = visibleResultIds.includes(resultKey);
                  const canPreviewOnMap = result.provider === 'mpc' && Boolean(result.bbox);

                  return (
                    <div className={isVisible ? 'result-item active' : 'result-item'} key={resultKey}>
                      <Layers3 size={15} />
                      <span>{result.id}</span>
                      <strong>{formatSearchResultMeta(result)}</strong>
                      <button
                        aria-label={isVisible ? '隐藏影像' : '显示影像'}
                        className="result-map-toggle"
                        disabled={!canPreviewOnMap}
                        onClick={() => onToggleResultOnMap(result)}
                        title={canPreviewOnMap ? undefined : '当前仅 MPC 结果支持地图瓦片预览'}
                        type="button"
                      >
                        {isVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="empty-result">当前条件下没有检索到 Sentinel-2 L2A 影像。</div>
              )}
            </div>
            {searchResults.length > RESULT_PAGE_SIZE && (
              <div className="result-pagination">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  type="button"
                >
                  上一页
                </button>
                <span>
                  {currentPage} / {pageCount}
                </span>
                <button
                  disabled={currentPage === pageCount}
                  onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                  type="button"
                >
                  下一页
                </button>
              </div>
            )}
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function parseRangeInput(value: string, label: string, min: number, max: number): [number, number] {
  const numbers = value
    .split(/[,，\s]+/)
    .filter((part) => part.trim().length > 0)
    .map((part) => Number(part.trim()))
    .filter((part) => !Number.isNaN(part));

  if (numbers.length !== 2) {
    throw new Error(`${label}请输入两个数字，例如：121.342691, 121.563309`);
  }

  const [rangeStart, rangeEnd] = numbers;

  if (rangeStart < min || rangeEnd > max || rangeStart >= rangeEnd) {
    throw new Error(`${label}范围不合法，请确认最小值小于最大值`);
  }

  return [rangeStart, rangeEnd];
}

function formatSearchResultMeta(result: MpcSearchResult) {
  const datetime = result.datetime ? new Date(result.datetime).toLocaleDateString('zh-CN') : '日期未知';
  const cloudCover =
    typeof result.cloudCover === 'number' ? `云量 ${result.cloudCover.toFixed(1)}%` : '云量未知';
  const tile = result.mgrsTile ? ` · ${result.mgrsTile}` : '';

  return `Sentinel-2 L2A · ${datetime} · ${cloudCover}${tile}`;
}

function filterSourceNode(node: SearchSourceNode, query: string): SearchSourceNode | null {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return node;
  }

  const matchesNode =
    node.name.toLowerCase().includes(normalizedQuery) || node.meta?.toLowerCase().includes(normalizedQuery);
  const filteredChildren = node.children
    ?.map((child) => filterSourceNode(child, normalizedQuery))
    .filter((child): child is SearchSourceNode => Boolean(child));

  if (matchesNode) {
    return node;
  }

  if (filteredChildren?.length) {
    return { ...node, children: filteredChildren };
  }

  return null;
}

function SourceTreeItem({
  node,
  selectedSources,
  toggleSource,
}: {
  node: SearchSourceNode;
  selectedSources: string[];
  toggleSource: (sourceId: string) => void;
}) {
  if (!node.children?.length && node.id) {
    return (
      <li>
        <label className={selectedSources.includes(node.id) ? 'source-tree-leaf active' : 'source-tree-leaf'}>
          <input checked={selectedSources.includes(node.id)} onChange={() => toggleSource(node.id!)} type="checkbox" />
          <Layers3 size={15} />
          <span>{node.name}</span>
          {node.meta && <strong>{node.meta}</strong>}
        </label>
      </li>
    );
  }

  return (
    <li>
      <details open>
        <summary>
          <ChevronRight size={14} />
          <Folder size={15} className="folder-closed" />
          <FolderOpen size={15} className="folder-open" />
          <span>{node.name}</span>
          {node.meta && <strong>{node.meta}</strong>}
        </summary>
        <ul>
          {node.children?.map((child) => (
            <SourceTreeItem
              key={child.id ?? child.name}
              node={child}
              selectedSources={selectedSources}
              toggleSource={toggleSource}
            />
          ))}
        </ul>
      </details>
    </li>
  );
}

function DataTreeItem({ node }: { node: DataTreeNode }) {
  if (!node.children?.length) {
    return (
      <li>
        <button className="tree-file" type="button">
          <Layers3 size={15} />
          <span>{node.name}</span>
          {node.meta && <strong>{node.meta}</strong>}
        </button>
      </li>
    );
  }

  return (
    <li>
      <details open>
        <summary>
          <ChevronRight size={14} />
          <Folder size={15} className="folder-closed" />
          <FolderOpen size={15} className="folder-open" />
          <span>{node.name}</span>
          {node.meta && <strong>{node.meta}</strong>}
        </summary>
        <ul>
          {node.children.map((child) => (
            <DataTreeItem key={child.name} node={child} />
          ))}
        </ul>
      </details>
    </li>
  );
}
