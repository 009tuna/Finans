'use strict';
// Audits captured computed styles, not antialiased screenshot pixels. Conversion
// coefficients follow CSS Color 4 sample code. Unsupported rendering is excluded.
const fs = require('node:fs');
function toLinear(v) { return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }
function toSrgb(v) { return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055; }
function color(value) {
  const match = value.match(/^(rgba?|oklab|oklch)\((.*)\)$/);
  if (!match) throw new Error('unsupported_color');
  const parts = match[2].replace(/,/g, ' ').split(/\s*\/\s*/);
  const coords = parts[0].trim().split(/\s+/);
  const number = (v, scale = 1) => v.endsWith('%') ? Number(v.slice(0, -1)) * scale / 100 : Number(v);
  const alpha = parts[1] ? number(parts[1]) : coords.length === 4 ? number(coords.pop()) : 1;
  let rgb;
  if (match[1].startsWith('rgb')) rgb = coords.map((v) => number(v, 255) / 255);
  else {
    const L = number(coords[0]);
    const a = match[1] === 'oklch' ? number(coords[1]) * Math.cos(number(coords[2]) * Math.PI / 180) : number(coords[1], 0.4);
    const b = match[1] === 'oklch' ? number(coords[1]) * Math.sin(number(coords[2]) * Math.PI / 180) : number(coords[2], 0.4);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    const linear = [4.0767416621*l - 3.3077115913*m + 0.2309699292*s, -1.2684380046*l + 2.6097574011*m - 0.3413193965*s, -0.0041960863*l - 0.7034186147*m + 1.7076147010*s];
    if (linear.some((v) => v < -0.00001 || v > 1.00001)) throw new Error('out_of_srgb_gamut');
    rgb = linear.map((v) => toSrgb(Math.max(0, Math.min(1, v))));
  }
  if (![...rgb, alpha].every(Number.isFinite)) throw new Error('invalid_color');
  return { rgb, alpha };
}
function over(fg, bg) { return fg.rgb.map((v, i) => v * fg.alpha + bg[i] * (1 - fg.alpha)); }
function luminance(rgb) { const v = rgb.map(toLinear); return v[0]*0.2126 + v[1]*0.7152 + v[2]*0.0722; }
function contrast(fg, bg) { const a = luminance(fg), b = luminance(bg); return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05); }
function audit(data) {
  return data.map(({theme, samples}) => {
    const measured = [], excluded = [];
    for (const sample of samples) {
      try {
        if (sample.backgrounds.some((row) => row.image !== 'none' || Number(row.opacity) !== 1)) throw new Error('image_or_group_opacity');
        let bg = [1,1,1];
        for (const row of [...sample.backgrounds].reverse()) bg = over(color(row.color), bg);
        const ratio = contrast(over(color(sample.color), bg), bg);
        const font = Number.parseFloat(sample.font), weight = Number(sample.weight);
        // WCAG uses 18pt regular / 14pt bold: 24px / 18.6667px at 96dpi.
        const threshold = font >= 24 || (font >= 14*4/3 && weight >= 700) ? 3 : 4.5;
        measured.push({label:sample.label,tag:sample.tag,font,weight,ratio,threshold,passes:ratio >= threshold});
      } catch (error) { excluded.push({label:sample.label,reason:error.message}); }
    }
    return {theme, measuredCount:measured.length, minimumRatio:Math.min(...measured.map((r)=>r.ratio)), failures:measured.filter((r)=>!r.passes), tinyText:measured.filter((r)=>r.font < 12), excluded, measured};
  });
}
if (require.main === module) {
  const input = process.argv[2], output = process.argv[3];
  if (!input || !output) throw new Error('Usage: node scripts/audit-ui-contrast.js input.json output.json');
  const report = {checkedAt:new Date().toISOString(), scope:'Captured visible text only; not all pages, states, placeholders, or a WCAG conformance claim.', sources:['https://www.w3.org/TR/css-color-4/#color-conversion-code','https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html'], themes:audit(JSON.parse(fs.readFileSync(input,'utf8')))};
  fs.writeFileSync(output, JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report.themes.map(({theme,measuredCount,minimumRatio,failures,tinyText,excluded})=>({theme,measuredCount,minimumRatio,failures,tinyText,excluded}))));
}
module.exports = {color,contrast,audit};
