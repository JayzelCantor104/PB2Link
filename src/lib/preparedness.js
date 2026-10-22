import { useEffect, useState } from 'react';

// Disaster preparedness (backend/api/preparedness.php, migration 033).
// Hotlines and guides load once per page load and are shared by every card.

const API_BASE = '/api_backend';

// Project NOAH 100-year flood levels, same wording and colours as DisasterMap.jsx.
export const FLOOD_LEVELS = {
  0: { label: 'Not in a mapped flood area', short: 'None mapped', color: '#16a34a', depth: '',
    advice: 'Project NOAH’s 100-year flood map does not show flooding on your street. Heavy rain can still overflow drains, so keep a go-bag ready and follow advisories.' },
  1: { label: 'Low flood risk', short: 'Low', color: '#ca8a04', depth: 'up to 0.5 m, knee-deep or less',
    advice: 'In a very heavy flood, water can reach knee height. Keep appliances, documents and medicines raised, and follow advisories.' },
  2: { label: 'Medium flood risk', short: 'Medium', color: '#ea580c', depth: '0.5–1.5 m, knee to neck deep',
    advice: 'Water can reach waist or neck height. Move valuables upstairs early, and plan to leave when a Watch or Warning is raised.' },
  3: { label: 'High flood risk', short: 'High', color: '#dc2626', depth: 'over 1.5 m, above the neck',
    advice: 'Water can go above head height. Leave as soon as the barangay raises a Warning, or earlier, and know the way to your evacuation center.' },
};

export const HOTLINE_CATEGORIES = {
  emergency: { label: 'Emergency', icon: 'bi-telephone-fill' },
  police: { label: 'Police', icon: 'bi-shield-fill' },
  fire: { label: 'Fire', icon: 'bi-fire' },
  medical: { label: 'Medical', icon: 'bi-heart-pulse-fill' },
  rescue: { label: 'Rescue / DRRM', icon: 'bi-life-preserver' },
  barangay: { label: 'Barangay', icon: 'bi-house-heart-fill' },
  utility: { label: 'Power / water', icon: 'bi-lightning-charge-fill' },
  other: { label: 'Other', icon: 'bi-telephone' },
};

export const GUIDE_HAZARDS = [
  { key: 'typhoon', label: 'Typhoon', icon: 'bi-tropical-storm' },
  { key: 'flood', label: 'Flood', icon: 'bi-water' },
  { key: 'earthquake', label: 'Earthquake', icon: 'bi-house-exclamation' },
  { key: 'fire', label: 'Fire', icon: 'bi-fire' },
];
export const GUIDE_PHASES = [
  { key: 'before', label: 'Before' },
  { key: 'during', label: 'During' },
  { key: 'after', label: 'After' },
];

// Household checklists. Ticks stay on this device only (localStorage).
export const CHECKLISTS = [
  {
    key: 'gobag',
    title: 'Go-bag (for 3 days)',
    icon: 'bi-backpack4-fill',
    items: [
      'Drinking water: 3 litres per person per day',
      'Ready-to-eat food and a can opener',
      'Maintenance medicines and a first-aid kit',
      'Copies of IDs, birth certificates and land or rent papers in a waterproof bag',
      'Flashlight, battery radio and spare batteries',
      'Charged power bank and phone charger',
      'Cash in small bills',
      'Whistle',
      'A change of clothes, a blanket and rain gear',
      'Face masks, soap, alcohol and sanitary items',
      'Baby, senior or PWD needs (milk, diapers, assistive devices)',
      'Pet food and leash, if you have pets',
    ],
  },
  {
    key: 'familyplan',
    title: 'Family plan',
    icon: 'bi-people-fill',
    items: [
      'Everyone knows our nearest evacuation center and the way there',
      'We agreed on a meeting place if we get separated',
      'We have one contact outside the barangay everyone can call',
      'Emergency hotlines are saved on every phone',
      'We know who helps the seniors, PWDs and children in our home',
      'We know how to switch off the main power and close the gas tank',
      'We know our street’s flood risk and when we will leave',
      'Advisory alerts are on (SMS in Edit Profile, or alerts on this phone)',
    ],
  },
];

const CHECK_KEY = 'pb2_prep_checklists';
export const loadTicks = () => {
  try {
    return JSON.parse(localStorage.getItem(CHECK_KEY) || '{}') || {};
  } catch {
    return {};
  }
};
export const saveTicks = (ticks) => {
  try {
    localStorage.setItem(CHECK_KEY, JSON.stringify(ticks));
  } catch {
    // private mode: ticks last for this visit only
  }
};

/** Digits and + only, for tel: links. */
export const telHref = (number) => `tel:${String(number || '').replace(/[^\d+]/g, '')}`;

/** A guide's steps for a language ('fil' falls back to English). */
export const guideSteps = (guide, lang = 'en') => {
  const text = lang === 'fil' && guide?.body_fil ? guide.body_fil : guide?.body;
  return String(text || '').split('\n').map((s) => s.trim()).filter(Boolean);
};

let cache = null;
let inflight = null;
const listeners = new Set();

export const loadPreparedness = (force = false) => {
  if (cache && !force) return Promise.resolve(cache);
  if (inflight && !force) return inflight;
  inflight = fetch(`${API_BASE}/preparedness.php?action=overview`)
    .then((res) => res.json())
    .then((json) => {
      if (!json.success) throw new Error('Not loaded');
      cache = { hotlines: json.hotlines || [], guides: json.guides || [], loaded: true };
      return cache;
    })
    .catch(() => cache || { hotlines: [], guides: [], loaded: true, failed: true })
    .then((data) => {
      inflight = null;
      listeners.forEach((fn) => fn(data));
      return data;
    });
  return inflight;
};

/** { hotlines, guides, loaded, failed? } shared by the cards on the page. */
export const usePreparedness = () => {
  const [data, setData] = useState(cache || { hotlines: [], guides: [], loaded: false });
  useEffect(() => {
    listeners.add(setData);
    loadPreparedness().then(setData);
    return () => { listeners.delete(setData); };
  }, []);
  return data;
};
