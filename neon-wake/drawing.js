// Bind the same drawing primitives to the flight canvas or a guide preview.
// Translation is evaluated when a label is drawn, so language changes stay live.
export function createDrawingTools(ctx, { translate = text => text, roundedPolygons = true } = {}) {
  return {
    polygon(points, fill, stroke, width = 1.5) {
      if (roundedPolygons) { ctx.lineJoin = 'round'; ctx.lineCap = 'round'; }
      ctx.beginPath();
      points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
    },

    line(x1, y1, x2, y2, color, width = 1) {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    },

    circle(x, y, radius, fill, stroke, width = 1) {
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
    },

    label(text, x, y, size = 12, color = '#76929b', align = 'left', weight = 500) {
      ctx.font = `${weight} ${size}px "Segoe UI", sans-serif`;
      ctx.fillStyle = color; ctx.textAlign = align;
      ctx.fillText(translate(text), x, y);
    },
  };
}
