// Common answers offered as dropdowns (SelectOrOther), so residents pick
// instead of typing. Every list ends with "Other (type it)" on the form, so an
// answer that isn't here can still be typed. Values are stored in capitals by
// the server (residents' own details), and the dropdown matches them without
// case or accents.

export const RELATIONSHIPS = [
  'Mother', 'Father', 'Spouse', 'Partner', 'Son', 'Daughter', 'Brother', 'Sister',
  'Grandmother', 'Grandfather', 'Grandson', 'Granddaughter', 'Aunt', 'Uncle', 'Niece', 'Nephew',
  'Cousin', 'Mother-in-law', 'Father-in-law', 'Son-in-law', 'Daughter-in-law', 'Sister-in-law', 'Brother-in-law',
  'Guardian', 'Godparent', 'Friend', 'Neighbor', 'Landlord', 'Employer', 'Co-worker',
];

// Most common religious affiliations in the Philippines (PSA census groups).
export const RELIGIONS = [
  'Roman Catholic', 'Iglesia ni Cristo', 'Islam', 'Born Again Christian',
  'Aglipayan', 'Seventh-day Adventist', "Jehovah's Witnesses",
  'Members Church of God International', 'Baptist', 'Methodist',
  'United Church of Christ in the Philippines', 'Church of Jesus Christ of Latter-day Saints',
  'Jesus Is Lord Church', 'Buddhist', 'None',
];

export const SUFFIXES = ['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'];

export const COUNTRIES = [
  'Philippines', 'Saudi Arabia', 'United Arab Emirates', 'Qatar', 'Kuwait', 'Bahrain', 'Oman',
  'United States', 'Canada', 'Japan', 'South Korea', 'Taiwan', 'Hong Kong', 'Singapore', 'Malaysia',
  'China', 'Australia', 'New Zealand', 'United Kingdom', 'Italy', 'Spain', 'Germany',
];

// Philippine provinces plus Metro Manila (same list the ID scanner uses).
export const PROVINCES = [
  'Metro Manila', 'Abra', 'Agusan del Norte', 'Agusan del Sur', 'Aklan', 'Albay', 'Antique', 'Apayao', 'Aurora',
  'Basilan', 'Bataan', 'Batanes', 'Batangas', 'Benguet', 'Biliran', 'Bohol', 'Bukidnon', 'Bulacan', 'Cagayan',
  'Camarines Norte', 'Camarines Sur', 'Camiguin', 'Capiz', 'Catanduanes', 'Cavite', 'Cebu', 'Cotabato',
  'Davao de Oro', 'Davao del Norte', 'Davao del Sur', 'Davao Occidental', 'Davao Oriental', 'Dinagat Islands',
  'Eastern Samar', 'Guimaras', 'Ifugao', 'Ilocos Norte', 'Ilocos Sur', 'Iloilo', 'Isabela', 'Kalinga', 'La Union',
  'Laguna', 'Lanao del Norte', 'Lanao del Sur', 'Leyte', 'Maguindanao del Norte', 'Maguindanao del Sur',
  'Marinduque', 'Masbate', 'Misamis Occidental', 'Misamis Oriental', 'Mountain Province', 'Negros Occidental',
  'Negros Oriental', 'Northern Samar', 'Nueva Ecija', 'Nueva Vizcaya', 'Occidental Mindoro', 'Oriental Mindoro',
  'Palawan', 'Pampanga', 'Pangasinan', 'Quezon', 'Quirino', 'Rizal', 'Romblon', 'Samar', 'Sarangani', 'Siquijor',
  'Sorsogon', 'South Cotabato', 'Southern Leyte', 'Sultan Kudarat', 'Sulu', 'Surigao del Norte', 'Surigao del Sur',
  'Tarlac', 'Tawi-Tawi', 'Zambales', 'Zamboanga del Norte', 'Zamboanga del Sur', 'Zamboanga Sibugay',
];

// Cities and municipalities offered once a province is picked. Only the
// provinces most residents were born in have a list; any other province gets
// a plain text box (SelectOrOther with no choices).
const CITIES_BY_PROVINCE = {
  'metro manila': ['Caloocan', 'Las Piñas', 'Makati', 'Malabon', 'Mandaluyong', 'Manila', 'Marikina', 'Muntinlupa',
    'Navotas', 'Parañaque', 'Pasay', 'Pasig', 'Pateros', 'Quezon City', 'San Juan', 'Taguig', 'Valenzuela'],
  cavite: ['Imus', 'Bacoor', 'Dasmariñas', 'General Trias', 'Cavite City', 'Kawit', 'Noveleta', 'Rosario', 'Tanza',
    'Trece Martires', 'Silang', 'Tagaytay', 'Carmona', 'General Mariano Alvarez', 'Naic', 'Indang', 'Alfonso',
    'Amadeo', 'General Emilio Aguinaldo', 'Magallanes', 'Maragondon', 'Mendez', 'Ternate'],
  laguna: ['Calamba', 'San Pedro', 'Biñan', 'Santa Rosa', 'Cabuyao', 'San Pablo', 'Los Baños', 'Santa Cruz', 'Bay',
    'Calauan', 'Pagsanjan', 'Siniloan', 'Nagcarlan', 'Liliw'],
  batangas: ['Batangas City', 'Lipa', 'Tanauan', 'Santo Tomas', 'Nasugbu', 'Bauan', 'Calaca', 'Lemery', 'Rosario',
    'San Juan', 'Balayan', 'Taal'],
  rizal: ['Antipolo', 'Cainta', 'Taytay', 'Rodriguez', 'San Mateo', 'Binangonan', 'Angono', 'Tanay', 'Morong',
    'Teresa', 'Baras', 'Cardona', 'Pililla', 'Jalajala'],
  bulacan: ['Malolos', 'Meycauayan', 'San Jose del Monte', 'Marilao', 'Bocaue', 'Baliuag', 'Santa Maria',
    'Guiguinto', 'Plaridel', 'Pulilan', 'Norzagaray', 'Obando'],
  quezon: ['Lucena', 'Tayabas', 'Sariaya', 'Candelaria', 'Tiaong', 'Gumaca', 'Infanta', 'Lucban'],
};

const key = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Cities to offer for a birth province (empty when the province has no list). */
export const citiesFor = (province) => CITIES_BY_PROVINCE[key(province)] || [];

export const OCCUPATIONS = [
  'Student', 'Employed (private company)', 'Government employee', 'Self-employed', 'Business owner',
  'Teacher', 'Health worker', 'Driver', 'Construction worker', 'Vendor', 'Housewife / Homemaker',
  'Overseas Filipino Worker (OFW)', 'Freelancer', 'Retired', 'Unemployed',
];

export const BUSINESS_TYPES = [
  'Sari-sari store', 'Carinderia / Eatery', 'Food stall / Food cart', 'Bakery', 'Retail store',
  'Online selling', 'Salon / Barbershop', 'Laundry shop', 'Water refilling station', 'Car wash',
  'Vulcanizing / Repair shop', 'Computer shop / Printing', 'Pharmacy / Drugstore', 'Hardware store',
  'Rental / Boarding house', 'Tutoring / Learning center', 'Catering', 'Tailoring / Dress shop',
];
