// Ibnbatota - Travel Leaderboard Logic

// --- App State ---
let dbMode = 'local'; // 'local' or 'supabase'
let supabaseClient = null;
let state = {
  friends: [], // Array of { id, name, avatar }
  visited: {},  // Map of friend_id -> Set of country_codes (lowercase)
  activeFriendId: null
};

// --- Definitions ---
const BADGE_DEFS = [
  { id: 'first_flight', name: 'First Flight 🛫', desc: 'Visit at least 1 country', check: (c, count) => count >= 1 },
  { id: 'globetrotter', name: 'Ibnbatota 🌍', desc: 'Visit at least 10 countries', check: (c, count) => count >= 10 },
  { id: 'mega_traveler', name: 'Mega Traveler 🚀', desc: 'Visit at least 25 countries', check: (c, count) => count >= 25 },
  { id: 'europe_champ', name: 'Euro Explorer 🇪🇺', desc: 'Visit 5 countries in Europe', check: (c) => countContinent(c, 'Europe') >= 5 },
  { id: 'asia_champ', name: 'Asia Explorer 🌏', desc: 'Visit 5 countries in Asia', check: (c) => countContinent(c, 'Asia') >= 5 },
  { id: 'africa_champ', name: 'Africa Explorer 🌍', desc: 'Visit 5 countries in Africa', check: (c) => countContinent(c, 'Africa') >= 5 },
  { id: 'americas_champ', name: 'Americas Explorer 🌎', desc: 'Visit 5 countries in Americas', check: (c) => countContinent(c, 'Americas') >= 5 },
  { id: 'island_hopper', name: 'Island Hopper 🏝️', desc: 'Visit 3 island nations (e.g. Japan, UK, Maldives, NZ, Indonesia, Iceland)', check: (c) => countIslands(c) >= 3 },
  { id: 'around_world', name: 'Around the World 🧭', desc: 'Visit countries in at least 3 continents', check: (c) => countUniqueContinents(c) >= 3 }
];

const ISLAND_CODES = ['jp', 'id', 'gb', 'nz', 'ph', 'cu', 'is', 'lk', 'mv', 'sg', 'km', 'cv', 'vu', 'sb', 'nc'];

// Helper to count countries in a continent
function countContinent(visitedCodes, continent) {
  let count = 0;
  visitedCodes.forEach(code => {
    const data = window.countriesData[code];
    if (data && data.continent === continent) {
      count++;
    }
  });
  return count;
}

// Helper to count island visits
function countIslands(visitedCodes) {
  let count = 0;
  visitedCodes.forEach(code => {
    if (ISLAND_CODES.includes(code.toLowerCase())) {
      count++;
    }
  });
  return count;
}

// Helper to count unique continents visited
function countUniqueContinents(visitedCodes) {
  const continents = new Set();
  visitedCodes.forEach(code => {
    const data = window.countriesData[code];
    if (data) {
      continents.add(data.continent);
    }
  });
  return continents.size;
}

// --- DOM Elements ---
const elStatus = document.getElementById('supabase-status');
const btnSettings = document.getElementById('btn-settings');
const modalSettings = document.getElementById('modal-settings');
const modalSettingsClose = document.getElementById('modal-settings-close');
const btnSaveSettings = document.getElementById('btn-save-settings');
const btnClearSettings = document.getElementById('btn-clear-settings');
const inputSbUrl = document.getElementById('sb-url');
const inputSbKey = document.getElementById('sb-key');

const addFriendFormInline = document.getElementById('add-friend-form-inline');
const inputFriendNameInline = document.getElementById('friend-name-inline');
const selectFriendEmojiInline = document.getElementById('friend-emoji-inline');

const inputQuickAddCountry = document.getElementById('quick-add-country');
const btnQuickAdd = document.getElementById('btn-quick-add');
const datalistCountries = document.getElementById('countries-datalist');

const elLeaderboardList = document.getElementById('leaderboard-list');
const elMapWrapper = document.getElementById('map-wrapper');
const elMapTooltip = document.getElementById('map-tooltip');
const elMapCountryCount = document.getElementById('map-country-count');

const selectFriend = document.getElementById('select-friend');
const inputSearchCountries = document.getElementById('search-countries');
const tabButtons = document.querySelectorAll('.tab-btn');
const elCountryListGrid = document.getElementById('country-list-grid');

const elActiveProfileHeader = document.getElementById('active-profile-header');
const elContinentProgressBars = document.getElementById('continent-progress-bars');
const elBadgesGrid = document.getElementById('badges-grid');

let selectedEmoji = '🧑‍🚀';
let activeTab = 'all';
let confirmCallback = null;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  populateDatalist();
  setupEventListeners();
  loadSupabaseSettings();
  await initDatabase();
  await loadWorldMap();
  renderApp();
});

// --- Event Listeners Setup ---
function setupEventListeners() {
  // Modals (safeguarded)
  if (btnSettings) btnSettings.addEventListener('click', () => showModal(modalSettings));
  if (modalSettingsClose) modalSettingsClose.addEventListener('click', () => hideModal(modalSettings));
  if (btnSaveSettings) btnSaveSettings.addEventListener('click', saveSettings);
  if (btnClearSettings) btnClearSettings.addEventListener('click', clearSettings);

  // Confirm Modal bindings
  const modalConfirm = document.getElementById('modal-confirm-visit');
  const modalConfirmClose = document.getElementById('modal-confirm-close');
  const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
  const btnConfirmSave = document.getElementById('btn-confirm-save');

  if (modalConfirmClose) modalConfirmClose.addEventListener('click', () => hideModal(modalConfirm));
  if (btnConfirmCancel) btnConfirmCancel.addEventListener('click', () => hideModal(modalConfirm));
  if (btnConfirmSave) {
    btnConfirmSave.addEventListener('click', () => {
      if (confirmCallback) {
        confirmCallback();
        confirmCallback = null;
      }
      hideModal(modalConfirm);
    });
  }

  // Add Friend Form (Inline)
  addFriendFormInline.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = inputFriendNameInline.value.trim();
    const emoji = selectFriendEmojiInline.value;
    if (name) {
      await createFriend(name, emoji);
      addFriendFormInline.reset();
      
      // Auto scroll and focus on countries input
      setTimeout(() => {
        const logCard = document.querySelector('.log-card');
        if (logCard) {
          logCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          logCard.classList.add('flash-glow');
          setTimeout(() => logCard.classList.remove('flash-glow'), 2000);
        }
        if (inputQuickAddCountry) {
          inputQuickAddCountry.focus();
        }
      }, 300);
    }
  });

  // Quick Add Country
  btnQuickAdd.addEventListener('click', handleQuickAdd);
  inputQuickAddCountry.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleQuickAdd();
    }
  });

  // Friend Selector
  selectFriend.addEventListener('change', (e) => {
    state.activeFriendId = e.target.value;
    localStorage.setItem('active_explorer_id', e.target.value);
    updateActiveFriendUI();
  });

  // Search Countries
  inputSearchCountries.addEventListener('input', renderCountriesGrid);

  // Continent Tabs
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.getAttribute('data-tab');
      renderCountriesGrid();
    });
  });
}

function showModal(modal) {
  modal.classList.remove('hidden');
}

function hideModal(modal) {
  modal.classList.add('hidden');
}

function populateDatalist() {
  datalistCountries.innerHTML = '';
  for (const [code, info] of Object.entries(window.countriesData)) {
    const opt = document.createElement('option');
    opt.value = info.name;
    datalistCountries.appendChild(opt);
  }
}

async function handleQuickAdd() {
  if (!state.activeFriendId) {
    alert('Please enter your name or select an explorer first!');
    return;
  }
  const typedName = inputQuickAddCountry.value.trim().toLowerCase();
  if (!typedName) return;

  // Try to find a matching country by name
  let matchedCode = null;
  for (const [code, info] of Object.entries(window.countriesData)) {
    if (info.name.toLowerCase() === typedName) {
      matchedCode = code;
      break;
    }
  }

  // Fallback: search for partial match if exact match not found
  if (!matchedCode) {
    for (const [code, info] of Object.entries(window.countriesData)) {
      if (info.name.toLowerCase().includes(typedName)) {
        matchedCode = code;
        break;
      }
    }
  }

  if (matchedCode) {
    const currentVisits = state.visited[state.activeFriendId] || new Set();
    if (currentVisits.has(matchedCode)) {
      alert(`You've already visited ${window.countriesData[matchedCode].name}!`);
    } else {
      const countryName = window.countriesData[matchedCode].name;
      const explorer = state.friends.find(f => f.id === state.activeFriendId);
      const explorerName = explorer ? explorer.name : 'Active Explorer';
      const explorerAvatar = explorer ? explorer.avatar : '🧑‍🚀';

      requestConfirmation(
        '🧭 Confirm Visit',
        `Do you want to log <strong>${countryName}</strong> for <strong>${explorerName}</strong>?`,
        explorerAvatar,
        () => {
          toggleVisitedCountry(state.activeFriendId, matchedCode, true);
          inputQuickAddCountry.value = '';
        }
      );
    }
  } else {
    alert(`Could not find a country matching "${inputQuickAddCountry.value}"`);
  }
}

// --- Database & Local Storage Functions ---
const DEFAULT_SB_URL = 'https://omuvrfsnqiztzcxlwvsb.supabase.co';
const DEFAULT_SB_KEY = 'sb_publishable_PmBzF6VZQzhbKemz-ziVFQ_50MG-C44';

function loadSupabaseSettings() {
  const url = localStorage.getItem('sb_url') || DEFAULT_SB_URL;
  const key = localStorage.getItem('sb_key') || DEFAULT_SB_KEY;
  inputSbUrl.value = url;
  inputSbKey.value = key;
}

async function initDatabase() {
  const isDisabled = localStorage.getItem('sb_disabled') === 'true';
  const url = localStorage.getItem('sb_url') || (isDisabled ? '' : DEFAULT_SB_URL);
  const key = localStorage.getItem('sb_key') || (isDisabled ? '' : DEFAULT_SB_KEY);

  if (url && key) {
    try {
      // Initialize Supabase Client
      supabaseClient = supabase.createClient(url, key);
      // Try to query a table to check if connection is active
      const { data, error } = await supabaseClient.from('friends').select('id').limit(1);
      if (error) throw error;

      dbMode = 'supabase';
      elStatus.className = 'status-badge status-connected';
      elStatus.innerHTML = '<span class="status-dot"></span> Supabase Connected';
      console.log('Supabase initialized successfully.');
    } catch (err) {
      console.error('Supabase initialization failed, falling back to local storage:', err);
      dbMode = 'local';
      elStatus.className = 'status-badge status-disconnected';
      elStatus.innerHTML = '<span class="status-dot"></span> Connection Failed (Local Mode)';
    }
  } else {
    dbMode = 'local';
    elStatus.className = 'status-badge status-disconnected';
    elStatus.innerHTML = '<span class="status-dot"></span> Offline Mode';
  }

  await loadData();
}

async function loadData() {
  if (dbMode === 'supabase') {
    try {
      // Load friends
      const { data: friends, error: fError } = await supabaseClient
        .from('friends')
        .select('*')
        .order('name');
      
      if (fError) throw fError;
      state.friends = friends || [];

      // Load visited countries
      const { data: visited, error: vError } = await supabaseClient
        .from('visited_countries')
        .select('*');
      
      if (vError) throw vError;

      // Group visited countries by friend_id
      state.visited = {};
      state.friends.forEach(f => {
        state.visited[f.id] = new Set();
      });
      
      visited.forEach(record => {
        if (!state.visited[record.friend_id]) {
          state.visited[record.friend_id] = new Set();
        }
        state.visited[record.friend_id].add(record.country_code.toLowerCase());
      });

    } catch (err) {
      console.error('Error fetching Supabase data, loading local storage:', err);
      fallbackToLocalData();
    }
  } else {
    fallbackToLocalData();
  }

  // Set active explorer (load from local storage to lock selection)
  const savedActiveId = localStorage.getItem('active_explorer_id');
  if (state.friends.length > 0) {
    if (savedActiveId && state.friends.some(f => f.id === savedActiveId)) {
      state.activeFriendId = savedActiveId;
    } else if (!state.activeFriendId || !state.friends.some(f => f.id === state.activeFriendId)) {
      state.activeFriendId = state.friends[0].id;
    }
  } else {
    state.activeFriendId = null;
  }
}

function fallbackToLocalData() {
  const localDb = localStorage.getItem('ibnbatota_db');
  if (localDb) {
    try {
      const parsed = JSON.parse(localDb);
      state.friends = parsed.friends || [];
      state.visited = {};
      
      // Convert arrays back to Sets
      if (parsed.visited) {
        for (const [friendId, countries] of Object.entries(parsed.visited)) {
          state.visited[friendId] = new Set(countries);
        }
      }
    } catch (e) {
      console.error('Error parsing local storage database:', e);
      initEmptyState();
    }
  } else {
    initEmptyState();
  }
}

function initEmptyState() {
  state.friends = [];
  state.visited = {};
  state.activeFriendId = null;
}

function saveLocalData() {
  if (dbMode === 'local') {
    // Map Sets to Arrays for JSON serialization
    const visitedObj = {};
    for (const [friendId, set] of Object.entries(state.visited)) {
      visitedObj[friendId] = Array.from(set);
    }
    localStorage.setItem('ibnbatota_db', JSON.stringify({
      friends: state.friends,
      visited: visitedObj
    }));
  }
}

// --- CRUD Actions ---
async function createFriend(name, avatar) {
  const newFriend = {
    name,
    avatar
  };

  if (dbMode === 'supabase') {
    try {
      const { data, error } = await supabaseClient
        .from('friends')
        .insert([newFriend])
        .select();

      if (error) throw error;
      if (data && data[0]) {
        state.friends.push(data[0]);
        state.visited[data[0].id] = new Set();
        state.activeFriendId = data[0].id;
        localStorage.setItem('active_explorer_id', data[0].id);
      }
    } catch (err) {
      alert('Failed to save friend to Supabase: ' + err.message);
      return;
    }
  } else {
    newFriend.id = generateUUID();
    state.friends.push(newFriend);
    state.visited[newFriend.id] = new Set();
    state.activeFriendId = newFriend.id;
    localStorage.setItem('active_explorer_id', newFriend.id);
    saveLocalData();
  }

  renderApp();
}

async function toggleVisitedCountry(friendId, countryCode, visitedState) {
  countryCode = countryCode.toLowerCase();
  
  if (!state.visited[friendId]) {
    state.visited[friendId] = new Set();
  }

  if (dbMode === 'supabase') {
    try {
      if (visitedState) {
        const { error } = await supabaseClient
          .from('visited_countries')
          .insert([{ friend_id: friendId, country_code: countryCode }]);
        
        if (error && error.code !== '23505') throw error; // Ignore duplicate key errors
        state.visited[friendId].add(countryCode);
      } else {
        const { error } = await supabaseClient
          .from('visited_countries')
          .delete()
          .match({ friend_id: friendId, country_code: countryCode });
        
        if (error) throw error;
        state.visited[friendId].delete(countryCode);
      }
    } catch (err) {
      console.error('Supabase country toggle failed:', err);
      alert('Failed to sync country visit: ' + err.message);
      return false;
    }
  } else {
    if (visitedState) {
      state.visited[friendId].add(countryCode);
    } else {
      state.visited[friendId].delete(countryCode);
    }
    saveLocalData();
  }

  // Update UI components dynamically
  renderLeaderboard();
  renderActiveProfile();
  updateMapHighlight();
  return true;
}

// --- Supabase Config Actions ---
async function saveSettings() {
  const url = inputSbUrl.value.trim();
  const key = inputSbKey.value.trim();

  if (!url || !key) {
    alert('Please fill out both Supabase URL and Anon Key.');
    return;
  }

  localStorage.setItem('sb_url', url);
  localStorage.setItem('sb_key', key);
  localStorage.removeItem('sb_disabled');
  
  hideModal(modalSettings);
  
  // Reload app with new settings
  elStatus.className = 'status-badge status-disconnected';
  elStatus.innerHTML = '<span class="status-dot"></span> Connecting...';
  
  await initDatabase();
  renderApp();
}

async function clearSettings() {
  localStorage.removeItem('sb_url');
  localStorage.removeItem('sb_key');
  localStorage.setItem('sb_disabled', 'true');
  inputSbUrl.value = '';
  inputSbKey.value = '';
  
  hideModal(modalSettings);
  
  dbMode = 'local';
  elStatus.className = 'status-badge status-disconnected';
  elStatus.innerHTML = '<span class="status-dot"></span> Offline Mode';
  
  await loadData();
  renderApp();
}

// --- Map Loader ---
async function loadWorldMap() {
  try {
    const response = await fetch('world-map.svg');
    if (!response.ok) throw new Error('Network error loading map');
    let svgText = await response.text();
    
    // Inject the SVG directly into the wrapper
    elMapWrapper.innerHTML = svgText;
    
    // Configure paths inside SVG
    const svgElement = elMapWrapper.querySelector('svg');
    if (svgElement) {
      svgElement.setAttribute('width', '100%');
      svgElement.setAttribute('height', '100%');
      
      // Inject gradient definition for visited styling
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      defs.innerHTML = `
        <linearGradient id="visited-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#00f2fe" />
          <stop offset="100%" stop-color="#4facfe" />
        </linearGradient>
      `;
      svgElement.insertBefore(defs, svgElement.firstChild);

      // Find all paths and groups representing countries
      const paths = svgElement.querySelectorAll('path, g');
      paths.forEach(el => {
        const id = el.getAttribute('id');
        if (id && id !== 'world-map' && id !== 'ocean' && !id.startsWith('path')) {
          el.classList.add('country-path');
          
          // Setup interaction events
          el.addEventListener('click', () => handleMapCountryClick(id));
          el.addEventListener('mouseenter', (e) => showMapTooltip(e, id));
          el.addEventListener('mousemove', (e) => moveMapTooltip(e));
          el.addEventListener('mouseleave', () => hideMapTooltip());
        }
      });
    }
  } catch (err) {
    elMapWrapper.innerHTML = `<div class="loading-spinner" style="color: var(--color-danger)">⚠️ Failed to load world map: ${err.message}</div>`;
  }
}

// Map interactions
async function handleMapCountryClick(countryCode) {
  if (!state.activeFriendId) {
    alert('Please enter your name or select an explorer first!');
    return;
  }
  
  const currentVisits = state.visited[state.activeFriendId] || new Set();
  const isVisited = currentVisits.has(countryCode.toLowerCase());
  const isChecking = !isVisited;
  
  const normalizedCode = countryCode.toLowerCase();
  const country = window.countriesData[normalizedCode];
  const countryName = country ? country.name : countryCode.toUpperCase();
  
  const explorer = state.friends.find(f => f.id === state.activeFriendId);
  const explorerName = explorer ? explorer.name : 'Active Explorer';
  const explorerAvatar = explorer ? explorer.avatar : '🧑‍🚀';

  const title = isChecking ? '🧭 Confirm Visit' : '⚠️ Remove Visit';
  const message = isChecking
    ? `Do you want to log <strong>${countryName}</strong> for <strong>${explorerName}</strong>?`
    : `Do you want to remove <strong>${countryName}</strong> from <strong>${explorerName}</strong>'s profile?`;

  requestConfirmation(title, message, explorerAvatar, () => {
    toggleVisitedCountry(state.activeFriendId, countryCode, isChecking);
  });
}

function showMapTooltip(e, countryCode) {
  const normalizedCode = countryCode.toLowerCase();
  const country = window.countriesData[normalizedCode];
  const name = country ? country.name : countryCode.toUpperCase();
  
  // Find who visited this country
  const visitors = [];
  state.friends.forEach(f => {
    if (state.visited[f.id] && state.visited[f.id].has(normalizedCode)) {
      visitors.push(`${f.avatar} ${f.name}`);
    }
  });

  let tooltipHtml = `<strong>${name}</strong>`;
  if (visitors.length > 0) {
    tooltipHtml += `<br><span style="font-size:0.75rem;color:var(--color-primary)">Visited by:</span><br>${visitors.join(', ')}`;
  } else {
    tooltipHtml += `<br><span style="font-size:0.75rem;color:var(--color-text-muted)">Unexplored</span>`;
  }

  elMapTooltip.innerHTML = tooltipHtml;
  elMapTooltip.classList.remove('hidden');
  moveMapTooltip(e);
}

function moveMapTooltip(e) {
  const mapRect = elMapWrapper.getBoundingClientRect();
  const tooltipRect = elMapTooltip.getBoundingClientRect();
  
  // Calculate relative position within the container
  let left = e.clientX - mapRect.left + 15;
  let top = e.clientY - mapRect.top + 15;
  
  // Collision detection (prevent tooltip from drawing outside map view)
  if (left + tooltipRect.width > mapRect.width) {
    left = e.clientX - mapRect.left - tooltipRect.width - 15;
  }
  if (top + tooltipRect.height > mapRect.height) {
    top = e.clientY - mapRect.top - tooltipRect.height - 15;
  }

  elMapTooltip.style.left = `${left}px`;
  elMapTooltip.style.top = `${top}px`;
}

function hideMapTooltip() {
  elMapTooltip.classList.add('hidden');
}

// Update Map country highlights based on active friend
function updateMapHighlight() {
  const activeVisits = state.activeFriendId ? (state.visited[state.activeFriendId] || new Set()) : new Set();
  
  // Reset all map paths
  const paths = elMapWrapper.querySelectorAll('.country-path');
  paths.forEach(el => {
    const id = el.getAttribute('id').toLowerCase();
    
    el.classList.remove('visited');
    el.classList.remove('visited-by-others');
    el.classList.remove('visited-by-multiple');

    if (activeVisits.has(id)) {
      el.classList.add('visited');
    } else {
      // Check if visited by others
      let otherVisitorCount = 0;
      state.friends.forEach(f => {
        if (f.id !== state.activeFriendId && state.visited[f.id] && state.visited[f.id].has(id)) {
          otherVisitorCount++;
        }
      });
      if (otherVisitorCount > 1) {
        el.classList.add('visited-by-multiple');
      } else if (otherVisitorCount === 1) {
        el.classList.add('visited-by-others');
      }
    }
  });

  // Update country stat total
  elMapCountryCount.textContent = `${activeVisits.size}/180 Countries Explored`;
}

// --- App Render Functions ---
function renderApp() {
  renderFriendDropdown();
  renderLeaderboard();
  renderCountriesGrid();
  renderActiveProfile();
  updateMapHighlight();
}

function renderFriendDropdown() {
  const currentActiveId = state.activeFriendId;
  selectFriend.innerHTML = '';
  
  if (state.friends.length === 0) {
    selectFriend.innerHTML = '<option value="">(No Friends Added Yet)</option>';
    return;
  }

  state.friends.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = `${f.avatar} ${f.name}`;
    selectFriend.appendChild(opt);
  });

  if (currentActiveId && state.friends.some(f => f.id === currentActiveId)) {
    selectFriend.value = currentActiveId;
  } else {
    selectFriend.value = state.friends[0].id;
    state.activeFriendId = state.friends[0].id;
  }
}

function updateActiveFriendUI() {
  // Update dropdown select
  selectFriend.value = state.activeFriendId;
  
  // Highlight in leaderboard list
  const items = elLeaderboardList.querySelectorAll('.leaderboard-item');
  items.forEach(el => {
    if (el.getAttribute('data-id') === state.activeFriendId) {
      el.classList.add('active-explorer');
    } else {
      el.classList.remove('active-explorer');
    }
  });

  // Sync checkboxes
  const activeVisits = state.visited[state.activeFriendId] || new Set();
  const checkboxes = elCountryListGrid.querySelectorAll('.country-checkbox');
  checkboxes.forEach(chk => {
    const code = chk.getAttribute('id').replace('chk-', '');
    const isChecked = activeVisits.has(code);
    chk.checked = isChecked;
    
    const item = chk.closest('.country-item');
    if (item) {
      if (isChecked) item.classList.add('checked');
      else item.classList.remove('checked');
    }
  });

  renderActiveProfile();
  updateMapHighlight();
}

function renderLeaderboard() {
  elLeaderboardList.innerHTML = '';
  
  if (state.friends.length === 0) {
    elLeaderboardList.innerHTML = `
      <div style="text-align:center;color:var(--color-text-muted);padding:2rem 1rem;">
        <span style="font-size:3rem;display:block;margin-bottom:1rem;">⛺</span>
        <h3>No explorers in the group yet.</h3>
        <p style="font-size:0.85rem;margin-top:0.5rem;">Click the "+ Add Friend" button above to get started!</p>
      </div>
    `;
    return;
  }

  // Calculate scores
  const leaderboardData = state.friends.map(f => {
    const visits = state.visited[f.id] || new Set();
    const count = visits.size;
    const pct = ((count / 180) * 100).toFixed(1);
    
    // Calculate badges
    let badgeCount = 0;
    BADGE_DEFS.forEach(badge => {
      if (badge.check(visits, count)) badgeCount++;
    });

    return {
      ...f,
      count,
      pct,
      badgeCount
    };
  });

  // Sort by count descending, then name
  leaderboardData.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name);
  });

  // Render list
  leaderboardData.forEach((item, index) => {
    const rank = index + 1;
    let rankDisplay = `#${rank}`;
    if (rank === 1) rankDisplay = '🥇';
    else if (rank === 2) rankDisplay = '🥈';
    else if (rank === 3) rankDisplay = '🥉';

    const div = document.createElement('div');
    div.className = `leaderboard-item ${item.id === state.activeFriendId ? 'active-explorer' : ''}`;
    div.setAttribute('data-id', item.id);
    div.innerHTML = `
      <div class="rank-badge">${rankDisplay}</div>
      <div class="explorer-avatar">${item.avatar}</div>
      <div class="explorer-info">
        <div class="explorer-name">${item.name}</div>
        <div class="explorer-meta">
          <span>🚩 <strong>${item.count}</strong> visited</span>
          <span>🏆 <strong>${item.badgeCount}</strong> badges</span>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width: ${item.pct}%"></div>
        </div>
      </div>
    `;

    // Click leaderboard row to make active
    div.addEventListener('click', () => {
      state.activeFriendId = item.id;
      localStorage.setItem('active_explorer_id', item.id);
      renderFriendDropdown();
      updateActiveFriendUI();
    });

    elLeaderboardList.appendChild(div);
  });
}

function renderCountriesGrid() {
  elCountryListGrid.innerHTML = '';
  
  const searchVal = inputSearchCountries.value.toLowerCase().trim();
  const activeVisits = state.activeFriendId ? (state.visited[state.activeFriendId] || new Set()) : new Set();

  let count = 0;

  for (const [code, info] of Object.entries(window.countriesData)) {
    // Filters
    if (activeTab !== 'all' && info.continent !== activeTab) continue;
    if (searchVal && !info.name.toLowerCase().includes(searchVal)) continue;

    count++;
    const isVisited = activeVisits.has(code);

    const label = document.createElement('label');
    label.className = `country-item ${isVisited ? 'checked' : ''}`;
    label.innerHTML = `
      <input type="checkbox" id="chk-${code}" class="country-checkbox" ${isVisited ? 'checked' : ''}>
      <span class="country-name" title="${info.name}">${info.name}</span>
    `;

    // Add Toggle Listener to checkbox
    const chk = label.querySelector('input');
    chk.addEventListener('change', (e) => {
      if (!state.activeFriendId) {
        e.target.checked = false;
        alert('Please enter your name or select an explorer first!');
        return;
      }
      
      const isChecking = e.target.checked;
      const countryName = info.name;
      const explorer = state.friends.find(f => f.id === state.activeFriendId);
      const explorerName = explorer ? explorer.name : 'Active Explorer';
      const explorerAvatar = explorer ? explorer.avatar : '🧑‍🚀';

      // Revert change temporarily until confirmed
      e.target.checked = !isChecking;

      const title = isChecking ? '🧭 Confirm Visit' : '⚠️ Remove Visit';
      const message = isChecking
        ? `Do you want to log <strong>${countryName}</strong> for <strong>${explorerName}</strong>?`
        : `Do you want to remove <strong>${countryName}</strong> from <strong>${explorerName}</strong>'s profile?`;

      requestConfirmation(title, message, explorerAvatar, () => {
        toggleVisitedCountry(state.activeFriendId, code, isChecking);
      });
    });

    elCountryListGrid.appendChild(label);
  }

  if (count === 0) {
    elCountryListGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding: 2rem; color:var(--color-text-muted)">
        No countries match your search parameters.
      </div>
    `;
  }
}

function renderActiveProfile() {
  elActiveProfileHeader.innerHTML = '';
  elContinentProgressBars.innerHTML = '';
  elBadgesGrid.innerHTML = '';

  if (!state.activeFriendId) {
    elActiveProfileHeader.innerHTML = '<p style="color:var(--color-text-muted)">No active explorer. Add a friend to start tracking stats!</p>';
    return;
  }

  const activeFriend = state.friends.find(f => f.id === state.activeFriendId);
  if (!activeFriend) return;

  const visits = state.visited[state.activeFriendId] || new Set();
  const totalVisited = visits.size;
  const worldPct = ((totalVisited / 180) * 100).toFixed(1);

  // Profile Header
  elActiveProfileHeader.innerHTML = `
    <div class="profile-header-avatar">${activeFriend.avatar}</div>
    <div class="profile-header-info">
      <h3>${activeFriend.name}</h3>
      <p>Explored ${totalVisited} countries (${worldPct}% of the map)</p>
    </div>
  `;

  // Continent Progress Bars
  const continents = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania'];
  const continentTotals = { Africa: 52, Americas: 34, Asia: 43, Europe: 43, Oceania: 8 }; // Matches our countries.js entries roughly

  continents.forEach(cont => {
    const visitedInCont = countContinent(visits, cont);
    const totalInCont = continentTotals[cont];
    const pct = ((visitedInCont / totalInCont) * 100).toFixed(0);

    const div = document.createElement('div');
    div.className = 'continent-stat';
    div.innerHTML = `
      <div class="continent-stat-header">
        <span>${cont}</span>
        <span><strong>${visitedInCont}/${totalInCont}</strong> (${pct}%)</span>
      </div>
      <div class="continent-progress-bg">
        <div class="continent-progress-fill" style="width: ${pct}%"></div>
      </div>
    `;
    elContinentProgressBars.appendChild(div);
  });

  // Badges Grid
  BADGE_DEFS.forEach(badge => {
    const isUnlocked = badge.check(visits, totalVisited);

    const div = document.createElement('div');
    div.className = `badge-item ${isUnlocked ? 'unlocked' : ''}`;
    div.setAttribute('data-desc', badge.desc);
    
    // Find icon
    let icon = '🎖️';
    if (badge.id === 'first_flight') icon = '🛫';
    else if (badge.id === 'globetrotter') icon = '🌍';
    else if (badge.id === 'mega_traveler') icon = '🚀';
    else if (badge.id === 'europe_champ') icon = '🇪🇺';
    else if (badge.id === 'asia_champ') icon = '🌏';
    else if (badge.id === 'africa_champ') icon = '🌍';
    else if (badge.id === 'americas_champ') icon = '🌎';
    else if (badge.id === 'island_hopper') icon = '🏝️';
    else if (badge.id === 'around_world') icon = '🧭';

    div.innerHTML = `
      <div class="badge-icon">${icon}</div>
      <div class="badge-name">${badge.name}</div>
    `;

    elBadgesGrid.appendChild(div);
  });
}

// --- Utils ---
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function requestConfirmation(title, message, avatar, onConfirm) {
  const modal = document.getElementById('modal-confirm-visit');
  const modalTitle = document.getElementById('confirm-modal-title');
  const promptText = document.getElementById('confirm-prompt-text');
  const avatarBadge = document.getElementById('confirm-avatar-badge');
  const btnSave = document.getElementById('btn-confirm-save');

  modalTitle.textContent = title;
  promptText.innerHTML = message;
  avatarBadge.textContent = avatar || '🧭';
  
  if (title.toLowerCase().includes('remove')) {
    btnSave.className = 'btn btn-danger';
    btnSave.textContent = 'Yes, Remove';
  } else {
    btnSave.className = 'btn btn-primary';
    btnSave.textContent = 'Yes, Confirm';
  }

  confirmCallback = onConfirm;
  showModal(modal);
}
