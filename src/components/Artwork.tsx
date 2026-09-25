import React from 'react';
import Svg, { Circle, Ellipse, G, Path, Rect, Line } from 'react-native-svg';

export type IconName = 'compass' | 'mail' | 'chat' | 'passport' | 'arrow' | 'close' | 'check' | 'spark' | 'clock' | 'globe' | 'chevron' | 'send' | 'shield' | 'bird' | 'postman' | 'back' | 'flag' | 'game' | 'translate' | 'shuffle' | 'search';
const paths: Record<IconName, string> = {
  game: 'M7 7h10c3 0 4 4 5 10 0 3-3 4-5 0l-1-2H8l-1 2c-2 4-5 3-5 0 1-6 2-10 5-10 M7 9v5 M4.5 11.5h5 M16 10h.1 M19 13h.1',
  translate: 'M2 5h12 M8 2v3 M4 5c0 6 4 8 8 10 M12 5c0 6-5 10-9 12 M13 21l5-13 5 13 M15 17h6',
  shuffle: 'M3 5h3c4 0 8 14 12 14h3 M17 15l4 4-4 4 M3 19h3c4 0 8-14 12-14h3 M17 1l4 4-4 4',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6',
  compass: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M16 8l-2.5 5.5L8 16l2.5-5.5L16 8',
  mail: 'M3 5h18v14H3z M3 6l9 7 9-7',
  chat: 'M21 11a9 9 0 0 1-9 9c-2 0-3.5-.5-5-1.5L3 20l1.5-4A9 9 0 1 1 21 11 M8 10h8 M8 14h5',
  passport: 'M5 3h14v18H5z M9 17h6 M12 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M8 10h8 M12 6v8',
  arrow: 'M4 12h16 M14 6l6 6-6 6', close: 'M6 6l12 12 M18 6L6 18', check: 'M5 12l4 4L19 6',
  spark: 'M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M2 12h20 M12 2c-6 6-6 14 0 20 6-6 6-14 0-20',
  chevron: 'M9 5l7 7-7 7', send: 'M3 3l19 8-8 3-3 8-8-19 M3 3l11 11',
  shield: 'M12 2l8 3v7c0 5-8 10-8 10S4 17 4 12V5l8-3 M8 11l3 3 5-5',
  bird: 'M3 17l4-5C5 8 6 4 8 2l7 7c3-3 6-1 6 1l2 1-3 1c-1 6-7 7-12 5l-5 2z M9 11l5 3',
  postman: 'M5 9h14 M6 9V5l6-3 6 3v4 M8 9v3a4 4 0 0 0 8 0V9 M3 22v-3c0-3 5-4 9-4s9 1 9 4v3 M9 17v5 M15 17v5',
  back: 'M20 12H4 M10 6l-6 6 6 6', flag: 'M5 22V3h14l-3 5 3 5H5',
};
export function Icon({ name, size = 22, color = '#254B46' }: { name: IconName; size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d={paths[name]} stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

export function PigeonArt({ size = 280 }: { size?: number }) {
  return <Svg width={size} height={size * .88} viewBox="0 0 320 282" accessibilityLabel="A pigeon carrying a sealed letter across the world">
    <Circle cx="180" cy="143" r="113" fill="#DCE6DA" />
    <Circle cx="265" cy="46" r="23" fill="#E8B77B" />
    <Path d="M14 235C70 245 55 173 86 190S100 263 164 222" stroke="#81968A" strokeWidth="1.5" strokeDasharray="4 7" fill="none" />
    <Path d="M51 61h41M61 70h19M257 178h34M275 188h28" stroke="#A3B7A6" strokeWidth="2" strokeLinecap="round" />
    <G rotation="-13" origin="170,150">
      <Path d="M92 170L40 130l53 2-22-58c54 6 96 42 100 69l-79 27" fill="#64847A" />
      <Path d="M94 158c-16-44 4-99 37-122l17 58 27 46" fill="#FBFAF1" />
      <Path d="M119 128c-10-19-7-46 3-67M130 132c-4-19-2-32 1-46" stroke="#DDE1D4" strokeWidth="3" fill="none" />
      <Path d="M86 158c25-20 51-19 78-18l29-36c10-16 43-11 44 8 0 12-12 24-24 25-3 48-54 81-102 50L86 158" fill="#F8F7EC" />
      <Path d="M106 157c28-23 60-18 83-13-13 28-41 44-65 27l-18-14" fill="#C6D5C8" />
      <Path d="M115 157c17-7 36-9 50-6M125 165c11-4 22-6 31-6" stroke="#AABDAE" strokeWidth="2" fill="none" />
      <Path d="M229 116l19 9-20 3" fill="#C78155" />
      <Circle cx="219" cy="112" r="3.5" fill="#244740" />
      <Path d="M175 185l-4 21M184 180l-1 22" stroke="#BE805A" strokeWidth="3" />
    </G>
    <G rotation="12" origin="194,210">
      <Rect x="150" y="186" width="87" height="59" rx="5" fill="#F4DAB5" stroke="#BD9A70" strokeWidth="1" />
      <Path d="M151 188l42 33 42-33M151 242l30-25M236 242l-30-25" fill="none" stroke="#BD9A70" strokeWidth="1" />
      <Circle cx="194" cy="217" r="10" fill="#B56949" />
      <Path d="M190 217l3 3 5-6" stroke="#E8B99C" strokeWidth="1.5" fill="none" />
    </G>
    <Path d="M66 216l3-7 3 7 7 3-7 3-3 7-3-7-7-3zM274 109l2-5 2 5 5 2-5 2-2 5-2-5-5-2z" fill="#B48B52" />
  </Svg>;
}

export function WorldArt() {
  return <Svg width="100%" height={148} viewBox="0 0 440 170" accessibilityLabel="An illustrated route connecting different parts of the world">
    {[30,65,100,135].map(y => <Line key={y} x1="0" y1={y} x2="440" y2={y} stroke="#DFE5DD" strokeWidth=".5" />)}
    {[45,105,165,225,285,345,405].map(x => <Line key={x} x1={x} y1="10" x2={x} y2="160" stroke="#DFE5DD" strokeWidth=".5" />)}
    <G fill="#C6D4C4"><Path d="M39 43l20-17 46-2 12 14 28-4 8 16-20 18-19 3-7 24-17 2-17-20-16-5-5-16-13-13zM103 98l21-7 24 15 11 21-14 30-15 10-7-26-16-19zM190 43l21-13 20 6 4 18-24 8-20-4zM209 69l31-11 29 16-1 29-20 34-15-8-5-26-17-11zM245 32l29-11 39 9 26-5 44 24-9 21-37-4-9 30-20 9-13-28-27-6-17-19zM332 128l33-14 29 17-10 20-37 3zM147 14l20-7 14 12-14 17-15-9z" /></G>
    <Path d="M98 57Q196-17 310 66T361 137" fill="none" stroke="#B67E53" strokeWidth="1.8" strokeDasharray="4 5" />
    {[{x:98,y:57},{x:226,y:45},{x:310,y:66},{x:361,y:137}].map((p,i) => <G key={i}><Circle cx={p.x} cy={p.y} r="7" fill="#FAF8F1" /><Circle cx={p.x} cy={p.y} r="3.5" fill="#477369" /></G>)}
  </Svg>;
}
