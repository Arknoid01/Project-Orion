/* Worker : calcul des hauteurs / humidité / pentes hors thread principal. */
importScripts('mapgenNumeric.js?v=1');

self.onmessage = function(e){
  const { seed, landStyle, cfg } = e.data;
  try {
    const fields = MapgenNumeric.computeFields(seed, landStyle, cfg);
    const heights = MapgenNumeric.flatten2d(fields.heights, cfg);
    const moisture = MapgenNumeric.flatten2d(fields.moisture, cfg);
    const slopes = MapgenNumeric.flatten2d(fields.slopes, cfg);
    self.postMessage({
      ok: true,
      jobId: e.data.jobId,
      heights,
      moisture,
      slopes,
      bridgePath: fields.bridgePath,
      corridorCells: fields.corridorCells,
    }, [heights.buffer, moisture.buffer, slopes.buffer]);
  } catch (err){
    self.postMessage({ ok: false, error: String(err && err.message ? err.message : err) });
  }
};
