// Shared routing logic — used by the browser app (app.js) and the CLI
// sanity checker (data/check-routing.mjs).

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Enumerate all routings from `from` to `to` with at most `maxLegs` flights.
 *
 * graph.routes: { SRC_IATA: { DST_IATA: ["XX", ...airline codes] } }
 * graph.airports: { IATA: { n, c, co, lat, lon } }
 *
 * `options.maxPaths` bounds the worst-case expansion (a safety cap for hub→hub
 * queries; realistically never hit on the current ~36k-edge graph).
 *
 * Returns [{ legs: [[from, to, airlines[]], ...], stops, distanceKm, directKm, detour }]
 * ranked by fewest stops, then lowest detour factor (route length ÷ direct
 * great-circle distance), then shortest distance. Ranking by detour instead of raw
 * distance penalises geographically backtracking routings.
 */
export function findRoutes(graph, from, to, maxLegs = 3, options = {}) {
  const { maxPaths = 20000 } = options;
  const adj = graph.routes;
  const ap = graph.airports;
  const paths = [];
  if (!from || !to || from === to || !adj[from] || !ap[from] || !ap[to]) return paths;

  const dist = (a, b) => haversineKm(ap[a].lat, ap[a].lon, ap[b].lat, ap[b].lon);
  const capped = () => paths.length >= maxPaths;

  // 0 stops (direct)
  if (adj[from][to]) paths.push([[from, to, adj[from][to]]]);

  // 1 stop
  if (maxLegs >= 2) {
    for (const a of Object.keys(adj[from])) {
      if (capped()) break;
      if (a === to || !adj[a]) continue;
      const al2 = adj[a][to];
      if (al2) paths.push([[from, a, adj[from][a]], [a, to, al2]]);
    }
  }

  // 2 stops
  if (maxLegs >= 3) {
    outer: for (const a of Object.keys(adj[from])) {
      if (a === to || !adj[a]) continue;
      for (const b of Object.keys(adj[a])) {
        if (capped()) break outer;
        if (b === from || b === a || b === to || !adj[b]) continue;
        const al3 = adj[b][to];
        if (al3) {
          paths.push([
            [from, a, adj[from][a]],
            [a, b, adj[a][b]],
            [b, to, al3],
          ]);
        }
      }
    }
  }

  const directKm = dist(from, to);

  return paths
    .map((legs) => {
      const distanceKm = legs.reduce((s, [f, t]) => s + dist(f, t), 0);
      return {
        legs,
        stops: legs.length - 1,
        distanceKm,
        directKm,
        detour: +(distanceKm / directKm).toFixed(3),
      };
    })
    .sort(
      (x, y) => x.stops - y.stops || x.detour - y.detour || x.distanceKm - y.distanceKm
    );
}
