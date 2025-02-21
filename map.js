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

// Initialize data structures
let stations = [];
let circles;
let trips = [];
let timeFilter = -1;
let filteredTrips = [];
let filteredArrivals = new Map();
let filteredDepartures = new Map();
let filteredStations = [];

// Create buckets for efficient time-based filtering
let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

// Get UI elements
const timeSlider = document.getElementById("time-slider");
const selectedTime = document.getElementById("selected-time");
const anyTimeLabel = document.getElementById("any-time");

// Helper function to convert station coordinates
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

// Helper function to format time (HH:MM AM/PM)
function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);
  return date.toLocaleString("en-US", { timeStyle: "short" });
}

// Convert Date object to minutes since midnight
function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// Function to filter trips based on time
function filterTripsbyTime() {
  filteredTrips =
    timeFilter === -1
      ? trips
      : trips.filter((trip) => {
          const startedMinutes = minutesSinceMidnight(trip.started_at);
          const endedMinutes = minutesSinceMidnight(trip.ended_at);
          return (
            Math.abs(startedMinutes - timeFilter) <= 60 ||
            Math.abs(endedMinutes - timeFilter) <= 60
          );
        });

  // Update filtered arrivals and departures
  filteredDepartures = d3.rollup(
    filteredTrips,
    (v) => v.length,
    (d) => d.start_station_id
  );

  filteredArrivals = d3.rollup(
    filteredTrips,
    (v) => v.length,
    (d) => d.end_station_id
  );

  // Update filtered stations with new traffic data
  filteredStations = stations.map((station) => {
    const newStation = { ...station }; // Clone to avoid modifying original
    const id = newStation.short_name;
    newStation.arrivals = filteredArrivals.get(id) ?? 0;
    newStation.departures = filteredDepartures.get(id) ?? 0;
    newStation.totalTraffic = newStation.arrivals + newStation.departures;
    return newStation;
  });

  // Update visualization with filtered data
  updateVisualization();
}

// Function to filter trips by minute efficiently
function filterByMinute(tripsByMinute, minute) {
  let minMinute = (minute - 60 + 1440) % 1440;
  let maxMinute = (minute + 60) % 1440;

  if (minMinute > maxMinute) {
    let beforeMidnight = tripsByMinute.slice(minMinute);
    let afterMidnight = tripsByMinute.slice(0, maxMinute + 1);
    return beforeMidnight.concat(afterMidnight).flat();
  } else {
    return tripsByMinute.slice(minMinute, maxMinute + 1).flat();
  }
}

// Update the UI when the slider moves
function updateTimeDisplay() {
  timeFilter = Number(timeSlider.value);

  if (timeFilter === -1) {
    selectedTime.textContent = "";
    anyTimeLabel.style.display = "block";
  } else {
    selectedTime.textContent = formatTime(timeFilter);
    anyTimeLabel.style.display = "none";
  }

  filterTripsbyTime();
}

// Update the updateVisualization function
function updateVisualization() {
  // Make radius range consistent for all states
  const radiusScale = d3
    .scaleSqrt()
    .domain([0, d3.max(filteredStations, (d) => d.totalTraffic) || 1])
    .range([3, 25]); // Consistent range for all states

  circles
    .data(filteredStations)
    .attr("r", (d) => radiusScale(d.totalTraffic))
    .style("--departure-ratio", (d) =>
      d.totalTraffic > 0 ? stationFlow(d.departures / d.totalTraffic) : 0.5
    )
    .each(function (d) {
      d3.select(this)
        .select("title")
        .text(
          `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
        );
    });
}

// Load the map data
map.on("load", () => {
  // Add bike lanes source and layer
  map.addSource("boston_route", {
    type: "geojson",
    data: "https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...",
  });

  map.addLayer({
    id: "bike-lanes",
    type: "line",
    source: "boston_route",
    paint: bikeLaneStyle,
  });

  Promise.all([
    d3.json("https://dsc106.com/labs/lab07/data/bluebikes-stations.json"),
    d3.csv("https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv"),
  ]).then(([stationData, trafficData]) => {
    stations = stationData.data.stations;
    trips = trafficData;

    // Convert date strings to Date objects and populate buckets
    for (let trip of trips) {
      trip.started_at = new Date(trip.started_at);
      trip.ended_at = new Date(trip.ended_at);

      // Populate time buckets
      const startedMinutes = minutesSinceMidnight(trip.started_at);
      const endedMinutes = minutesSinceMidnight(trip.ended_at);
      departuresByMinute[startedMinutes].push(trip);
      arrivalsByMinute[endedMinutes].push(trip);
    }

    // Initialize circles with consistent radius scale
    const radiusScale = d3
      .scaleSqrt()
      .domain([0, d3.max(stations, (d) => d.totalTraffic)])
      .range([3, 25]); // Consistent with updateVisualization

    circles = d3
      .select("#map svg")
      .selectAll("circle")
      .data(stations)
      .enter()
      .append("circle")
      .attr("r", (d) => radiusScale(d.totalTraffic))
      .attr("fill", "steelblue")
      .attr("stroke", "white")
      .attr("stroke-width", 1)
      .attr("fill-opacity", 0.6)
      .each(function (d) {
        d3.select(this)
          .append("title")
          .text(
            `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
          );
      });

    updatePositions();
    timeSlider.addEventListener("input", updateTimeDisplay);
    updateTimeDisplay();
  });
});

const stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

// Keep circles in position on map movements
map.on("move", updatePositions);
map.on("zoom", updatePositions);
map.on("resize", updatePositions);
map.on("moveend", updatePositions);
