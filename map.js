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

// Function to filter trips efficiently based on time
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

  updateVisualization();
}

// Update the visualization based on the selected time filter
function updateVisualization() {
  const filteredDepartures =
    timeFilter === -1
      ? d3.rollup(
          trips,
          (v) => v.length,
          (d) => d.start_station_id
        )
      : d3.rollup(
          filterByMinute(departuresByMinute, timeFilter),
          (v) => v.length,
          (d) => d.start_station_id
        );

  const filteredArrivals =
    timeFilter === -1
      ? d3.rollup(
          trips,
          (v) => v.length,
          (d) => d.end_station_id
        )
      : d3.rollup(
          filterByMinute(arrivalsByMinute, timeFilter),
          (v) => v.length,
          (d) => d.end_station_id
        );

  // Update station data with filtered traffic
  const filteredStations = stations.map((station) => {
    const newStation = { ...station };
    const id = newStation.short_name;
    newStation.arrivals = filteredArrivals.get(id) ?? 0;
    newStation.departures = filteredDepartures.get(id) ?? 0;
    newStation.totalTraffic = newStation.arrivals + newStation.departures;
    return newStation;
  });

  // Adjust circle sizes
  const radiusScale = d3
    .scaleSqrt()
    .domain([0, d3.max(filteredStations, (d) => d.totalTraffic) || 1])
    .range(timeFilter === -1 ? [0, 25] : [3, 50]);

  circles
    .data(filteredStations)
    .attr("r", (d) => radiusScale(d.totalTraffic))
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
      departuresByMinute[minutesSinceMidnight(trip.started_at)].push(trip);
      arrivalsByMinute[minutesSinceMidnight(trip.ended_at)].push(trip);
    }

    // Initialize circles
    const radiusScale = d3
      .scaleSqrt()
      .domain([0, d3.max(stations, (d) => d.totalTraffic)])
      .range([0, 25]);
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

// Keep circles in position on map movements
map.on("move", updatePositions);
map.on("zoom", updatePositions);
map.on("resize", updatePositions);
map.on("moveend", updatePositions);
