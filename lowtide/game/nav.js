/* Route planning on the road network (ngraph.path's A*, vendor/ngraph).

   The graph: one node per driving lane (traffic.js builds them, stop line to stop line), a link from each lane to
   every lane it can turn onto at the junction it ends at. A link costs the time to drive the lane it leads onto
   (its length over its cruising speed) plus a little for turning (more for a left across traffic, a lot for a
   U-turn) and for a signalled junction. The heuristic is the straight-line distance over the fastest cruise, so it
   never overestimates and A* stays exact.

   Drivers ask for a route to somewhere (a lane, or the lane nearest a point) and follow it turn by turn; they ask
   again when they're knocked off it. Cops ask with a bias: lanes another unit is already using cost more, so a
   few cars sent after you come in down different streets instead of nose to tail. */
import { createGraph, aStar } from "../vendor/ngraph/ngraph.module.min.js";

const VMAX = 30;   // fastest anyone plans to go (m/s), for the heuristic

function heading(a, b) { return Math.atan2(b.x - a.x, b.z - a.z); }
function turnCost(l, m) {
  const P = l.pts, Q = m.pts, h0 = heading(P[P.length - 2], P[P.length - 1]), h1 = heading(Q[0], Q[1]);
  const d = Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0));   // >0: turning left (Marlowe Keys drives on the right)
  if (m.e === l.e) return 12;              // turning round at a dead end
  if (Math.abs(d) < 0.4) return 0;         // straight on
  return d > 0 ? 3.5 : 1.5;                // left across the traffic, right on the inside
}

export class Nav {
  constructor(lanes, opts = {}) {
    this.lanes = lanes; this.signalled = opts.signalled || (() => false);
    lanes.forEach((l, i) => { l.nid = i; l.mid = l.pts[l.pts.length >> 1]; l.time = l.L / Math.max(1, l.cruise); });
    const g = this.g = createGraph();
    for (const l of lanes) g.addNode(l.nid, l);
    for (const l of lanes) for (const m of l.out) g.addLink(l.nid, m.nid, { cost: m.time + turnCost(l, m) + (this.signalled(l.to) ? 2.5 : 0) });
    this.bias = null;   // (lane) => extra seconds, set around a biased search
    this.finder = aStar(g, {
      oriented: true,
      distance: (a, b, link) => link.data.cost + (this.bias ? this.bias(b.data) : 0),
      heuristic: (a, b) => Math.hypot(a.data.mid.x - b.data.mid.x, a.data.mid.z - b.data.mid.z) / VMAX,
    });
  }
  // the lane nearest a point (optionally only ones heading roughly along `a`)
  nearest(x, z, a = null) {
    let best = null, bd = Infinity;
    for (const l of this.lanes) for (let i = 0; i < l.pts.length - 1; i += 2) {
      const p = l.pts[i], d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d >= bd) continue;
      if (a !== null) { const n = l.pts[i + 1]; if (Math.cos(heading(p, n) - a) < 0) continue; }
      bd = d; best = l;
    }
    return best;
  }
  /* lanes to drive from `from` to `to` (from first, to last), or null. bias(lane) adds seconds to a lane. */
  route(from, to, bias = null) {
    if (!from || !to) return null;
    if (from === to) return [from];
    this.bias = bias;
    let p; try { p = this.finder.find(from.nid, to.nid); } finally { this.bias = null; }
    if (!p || !p.length) return null;
    return p.map((n) => n.data).reverse();
  }
  // a lane somewhere between lo and hi metres (as the crow flies) from `l`, for a driver to head for
  destination(l, R = Math.random, lo = 150, hi = 600) {
    for (let k = 0; k < 30; k++) {
      const m = this.lanes[(R() * this.lanes.length) | 0], d = Math.hypot(m.mid.x - l.mid.x, m.mid.z - l.mid.z);
      if (d >= lo && d <= hi) return m;
    }
    return this.lanes[(R() * this.lanes.length) | 0];
  }
}
