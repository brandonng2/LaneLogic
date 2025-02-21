// Set your Mapbox access token here
mapboxgl.accessToken =
  "pk.eyJ1IjoiYnJhbmJvbmciLCJhIjoiY203ZTgzdHA4MGJxNTJsb29tNWI5Mnc3diJ9.OnegPxr61OZ038-40BK0BQ";

// Shared styling for bike lanes
const bikeLaneStyle = {
  "line-color": "#32D400",
  "line-width": 5,
  "line-opacity": 0.6,
};

// Initialize the map
const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/streets-v12",
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

// Initialize empty stations array and circles selection
const svg = d3.select("#map").select("svg");
let stations = [];
let circles;
let trips = [];

// Helper function to convert coordinates
function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat);
  const { x, y } = map.project(point);
  return { cx: x, cy: y };
}

// Function to update circle positions
function updatePositions() {
  if (circles) {
    circles
      .attr("cx", (d) => getCoords(d).cx)
      .attr("cy", (d) => getCoords(d).cy);
  }
}

// Wait for the map to load before adding all data
map.on("load", () => {
  // Add Boston bike lanes
  map.addSource("boston_route", {
    type: "geojson",
    data: "https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson",
  });

  map.addLayer({
    id: "boston-bike-lanes",
    type: "line",
    source: "boston_route",
    paint: bikeLaneStyle,
  });

  // Add Cambridge bike lanes
  map.addSource("cambridge_route", {
    type: "geojson",
    data: "https://data.cambridgema.gov/api/geospatial/ink7-xng4?method=export&format=GeoJSON",
  });

  map.addLayer({
    id: "cambridge-bike-lanes",
    type: "line",
    source: "cambridge_route",
    paint: bikeLaneStyle,
  });

  // Load both station and traffic data
  Promise.all([
    d3.json("https://dsc106.com/labs/lab07/data/bluebikes-stations.json"),
    d3.csv("https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv"),
  ])
    .then(([stationData, trafficData]) => {
      stations = stationData.data.stations;
      trips = trafficData;

      // Calculate departures and arrivals
      const departures = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.start_station_id
      );

      const arrivals = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.end_station_id
      );

      // Add traffic data to stations
      stations = stations.map((station) => {
        const id = station.short_name;
        station.arrivals = arrivals.get(id) ?? 0;
        station.departures = departures.get(id) ?? 0;
        station.totalTraffic = station.arrivals + station.departures;
        return station;
      });

      // Create square root scale for circle sizes
      const radiusScale = d3
        .scaleSqrt()
        .domain([0, d3.max(stations, (d) => d.totalTraffic)])
        .range([0, 25]);

      // Create circles for each station - FIXED VERSION
      circles = svg
        .selectAll("circle")
        .data(stations)
        .enter()
        .append("circle")
        .attr("r", (d) => radiusScale(d.totalTraffic))
        .attr("fill", "steelblue")
        .attr("stroke", "white")
        .attr("stroke-width", 1)
        .attr("fill-opacity", 0.6)
        .style("pointer-events", "auto")
        .each(function (d) {
          // Add <title> for browser tooltips
          d3.select(this)
            .append("title")
            .text(
              `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
            );
        });

      // Initial position update
      updatePositions();
    })
    .catch((error) => {
      console.error("Error loading data:", error);
    });
});

// Add event listeners for map movements
map.on("move", updatePositions);
map.on("zoom", updatePositions);
map.on("resize", updatePositions);
map.on("moveend", updatePositions);
