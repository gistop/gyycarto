import { Crosshair, Layers, LocateFixed, Maximize2, Minus, Plus, Ruler } from 'lucide-react';

const scenes = [
  { id: 'LC09_132037_20260706', left: '22%', top: '16%', width: '24%', height: '23%' },
  { id: 'S2B_49SGU_20260710', left: '43%', top: '28%', width: '29%', height: '28%' },
  { id: 'S2A_49SGV_20260715', left: '35%', top: '51%', width: '34%', height: '25%' },
];

export function MapCanvas() {
  return (
    <section className="map-workspace">
      <div className="map-toolbar">
        <div className="toolbar-group">
          <button aria-label="放大">
            <Plus size={17} />
          </button>
          <button aria-label="缩小">
            <Minus size={17} />
          </button>
          <button aria-label="定位">
            <LocateFixed size={17} />
          </button>
          <button aria-label="图层">
            <Layers size={17} />
          </button>
          <button aria-label="测量">
            <Ruler size={17} />
          </button>
          <button aria-label="全屏">
            <Maximize2 size={17} />
          </button>
        </div>
      </div>

      <div className="map-stage">
        <div className="map-base">
          <div className="terrain terrain-a" />
          <div className="terrain terrain-b" />
          <div className="terrain terrain-c" />
          <div className="river river-a" />
          <div className="river river-b" />
          <div className="aoi-boundary" />
          {scenes.map((scene) => (
            <div
              className="scene-footprint"
              key={scene.id}
              style={{ height: scene.height, left: scene.left, top: scene.top, width: scene.width }}
            >
              <span>{scene.id}</span>
            </div>
          ))}
          <div className="map-crosshair">
            <Crosshair size={22} />
          </div>
        </div>
      </div>

      <div className="map-statusbar">
        <span>经度 101.4368</span>
        <span>纬度 34.7821</span>
        <span>比例尺 1:250,000</span>
        <span>坐标系 CGCS2000</span>
      </div>
    </section>
  );
}
