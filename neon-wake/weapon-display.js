import { t } from './i18n.js';

const number = (value, places = 1) => {
 if(!Number.isFinite(value))return '0';
 const rounded=Math.round(value*10**places)/10**places;
 const text=String(rounded);
 return Math.abs(rounded)>=10000?text.replace(/\B(?=(\d{3})+(?!\d))/g,','):text;
};
const seconds = value => number(value, value < 1 ? 2 : 1);
const cooldown = value => t('Cooldown {seconds} s', {seconds:seconds(value)});

// Temporary triple damage is applied on impact rather than inside Game.stats().
export function systemStatLines(key, stats, damageMultiplier = 1, homingBoost = false) {
 if (!stats) return [];
 const damage = value => number(value * damageMultiplier);
 if (key === 'primary') return [
  t(stats.shotCount===1 ? '{count} shot per volley · {damage} damage each' : '{count} shots per volley · {damage} damage each', {count:number(stats.shotCount),damage:damage(stats.damage)}),
  cooldown(stats.interval),
 ];
 if (key === 'missiles') return [
  t(stats.count===1 ? '{count} missile per volley · {damage} damage each' : '{count} missiles per volley · {damage} damage each', {count:number(stats.count),damage:damage(stats.damage)}),
  cooldown(stats.cooldown),
 ];
 if (key === 'laser') return [
  t(stats.count===1 ? '{count} beam · {damage} damage/s each' : '{count} beams · {damage} damage/s each', {count:number(stats.count),damage:number(stats.damagePerSecond * damageMultiplier,0)}),
  homingBoost?t('Homing · Curves through enemies'):
   t('Continuous · Tracks ±{angle}° at {speed}°/s', {angle:number(stats.maxAngle*180/Math.PI),speed:number(stats.turnSpeed*180/Math.PI)}),
 ];
 if (key === 'shield') return [
  t(stats.charges===1 ? '{count} block · Active {seconds} s' : '{count} blocks · Active {seconds} s', {count:number(stats.charges),seconds:number(stats.duration)}),
  cooldown(stats.cooldown),
 ];
 if (key === 'pulse') return [t('{damage} damage to every enemy', {damage:damage(stats.damage)})];
 return [];
}
