// Property Valuation Extension - Content Script
console.log('Property valuation extension loaded');

// ============================================
// CONFIGURATION
// ============================================
// To enable AI photo analysis for building age estimation:
// 1. Get an OpenAI API key from https://platform.openai.com/api-keys
// 2. Replace 'YOUR_OPENAI_API_KEY_HERE' below with your actual API key
// 3. Note: This will cost ~$0.01-0.03 per property analyzed
const OPENAI_API_KEY = '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';
const ENABLE_AI_PHOTO_ANALYSIS = true; // Set to true to enable
// ============================================

let currentURL = window.location.href;

// Initialize on load
if (window.location.href.includes('realestate.com.au/property-')) {
  setTimeout(init, 1000);
}

// Watch for URL changes (SPA navigation)
const observer = new MutationObserver(() => {
  if (window.location.href !== currentURL && window.location.href.includes('realestate.com.au/property-')) {
    currentURL = window.location.href;
    const existingWidget = document.getElementById('property-valuation-widget');
    if (existingWidget) {
      existingWidget.remove();
    }
    setTimeout(init, 1000);
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

async function init() {
  console.log('Init called, current URL:', window.location.href);
  
  // Find the price element
  const priceElement = document.querySelector('.property-price') || 
                       document.querySelector('[class*="property-price"]') ||
                       document.querySelector('[class*="PropertyPrice"]');
  
  if (!priceElement) {
    console.log('Could not find price element');
    return;
  }
  
  console.log('Price element found:', priceElement);
  
  // Extract property details
  const propertyDetails = await extractPropertyDetails();
  
  if (!propertyDetails.address || !propertyDetails.suburb || !propertyDetails.state) {
    console.log('Missing required property details:', propertyDetails);
    return;
  }
  
  console.log('Property details:', propertyDetails);
  
  // Create and inject widget
  const widget = createWidget();
  priceElement.parentNode.insertBefore(widget, priceElement.nextSibling);
  
  // Get valuation
  try {
    const valuation = await getValuation(propertyDetails);
    updateWidget(valuation);
  } catch (error) {
    console.error('Valuation error:', error);
    updateWidget({ error: error.message });
  }
}

function calculateWeightedMedian(comparables) {
  // Calculate weighted median - more robust against outliers than weighted average
  // Sort by adjusted price
  const sorted = [...comparables].sort((a, b) => a.adjustedPrice - b.adjustedPrice);
  
  // Calculate cumulative weights
  const totalWeight = sorted.reduce((sum, comp) => sum + comp.similarityScore, 0);
  const halfWeight = totalWeight / 2;
  
  let cumulativeWeight = 0;
  for (let i = 0; i < sorted.length; i++) {
    cumulativeWeight += sorted[i].similarityScore;
    
    // When we pass the halfway point, that's our weighted median
    if (cumulativeWeight >= halfWeight) {
      // If we're exactly at halfway and there's a next value, interpolate
      if (cumulativeWeight === halfWeight && i < sorted.length - 1) {
        return Math.round((sorted[i].adjustedPrice + sorted[i + 1].adjustedPrice) / 2);
      }
      return Math.round(sorted[i].adjustedPrice);
    }
  }
  
  // Fallback (shouldn't reach here)
  return Math.round(sorted[Math.floor(sorted.length / 2)].adjustedPrice);
}

function calculateGrowthRate(comparables) {
  // Use actual Perth suburb growth rates (based on recent market data)
  // These are more accurate than trying to calculate from comparables
  
  const today = new Date();
  const salesWithDates = [];
  
  // Parse all sale dates
  comparables.forEach(comp => {
    if (!comp.soldDate) return;
    
    const soldDateText = comp.soldDate.toLowerCase();
    const dateMatch = soldDateText.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
    
    if (dateMatch) {
      const [, day, month, year] = dateMatch;
      const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const monthIndex = months.findIndex(m => month.toLowerCase().startsWith(m));
      
      if (monthIndex !== -1) {
        const saleDate = new Date(parseInt(year), monthIndex, parseInt(day));
        const monthsAgo = (today - saleDate) / (1000 * 60 * 60 * 24 * 30);
        
        salesWithDates.push({
          price: comp.price,
          date: saleDate,
          monthsAgo: monthsAgo,
          suburb: comp.address ? comp.address.toLowerCase() : ''
        });
      }
    }
  });
  
  if (salesWithDates.length < 2) {
    console.log('Not enough sales data, using default 0.7%/month growth');
    return 0.007;
  }
  
  // Extract suburb from first comparable
  let suburb = '';
  if (salesWithDates[0].suburb) {
    const parts = salesWithDates[0].suburb.split(',');
    if (parts.length >= 2) {
      suburb = parts[parts.length - 1].trim().toLowerCase();
    }
  }
  
  // Real Perth suburb growth rates (monthly) - based on 2024-2025 market data
  // Source: REIWA quarterly reports, adjusted to monthly rates
  const suburbGrowthRates = {
    // INNER CITY - Strong growth (12-15% annually)
    'perth': 0.010,           // 12.7% annually
    'northbridge': 0.010,
    'highgate': 0.010,
    'mount lawley': 0.011,    // 14% annually
    'mt lawley': 0.011,
    'maylands': 0.011,
    'east perth': 0.009,
    'west perth': 0.009,
    
    // INNER SUBURBS - Good growth (10-12% annually)
    'subiaco': 0.009,         // 11.3% annually
    'leederville': 0.009,
    'north perth': 0.009,
    'nedlands': 0.008,        // 10% annually
    'claremont': 0.008,
    'cottesloe': 0.007,       // 8.7% annually (already expensive, slower growth)
    'mosman park': 0.007,
    'peppermint grove': 0.006, // 7.4% annually (premium area, stable)
    'south perth': 0.008,
    'como': 0.008,
    'victoria park': 0.009,
    'applecross': 0.007,
    'ardross': 0.007,
    
    // COASTAL - Moderate growth (8-10% annually)
    'city beach': 0.007,      // 8.7% annually
    'scarborough': 0.008,
    'trigg': 0.008,
    'north beach': 0.008,
    'watermans bay': 0.008,
    'sorrento': 0.007,
    'hillarys': 0.007,
    'mullaloo': 0.007,
    
    // NORTHERN SUBURBS - Strong growth (10-14% annually)
    'joondalup': 0.009,       // 11.3% annually
    'padbury': 0.010,
    'craigie': 0.010,
    'beldon': 0.010,
    'greenwood': 0.010,
    'warwick': 0.010,
    'duncraig': 0.009,
    'churchlands': 0.008,
    'karrinyup': 0.008,
    
    // EASTERN SUBURBS - Very strong growth (12-16% annually)
    'bayswater': 0.011,       // 14% annually
    'bassendean': 0.012,      // 15.4% annually
    'morley': 0.011,
    'noranda': 0.011,
    'beechboro': 0.012,
    'embleton': 0.011,
    'ashfield': 0.011,
    
    // SOUTHERN SUBURBS - Moderate growth (8-11% annually)
    'fremantle': 0.008,       // 10% annually
    'south fremantle': 0.008,
    'white gum valley': 0.009,
    'hamilton hill': 0.009,
    'bibra lake': 0.010,
    'success': 0.010,
    'cockburn': 0.010,
    'atwell': 0.010,
    'aubin grove': 0.010,
    
    // MELVILLE AREA - Good growth (9-11% annually)
    'melville': 0.008,        // 10% annually
    'booragoon': 0.008,
    'palmyra': 0.008,
    'bicton': 0.007,
    'attadale': 0.007,
    'alfred cove': 0.007,
    'willetton': 0.008,
    'rossmoyne': 0.008,
    'shelley': 0.008,
    'riverton': 0.009,
    'ferndale': 0.009,
    'lynwood': 0.009,
    'parkwood': 0.009,
    
    // SOUTH EAST - Moderate growth (8-10% annually)
    'gosnells': 0.009,        // 11.3% annually
    'thornlie': 0.009,
    'maddington': 0.010,
    'kelmscott': 0.010,
    'armadale': 0.010,
    'piara waters': 0.011,    // 14% annually (new area, high growth)
    'harrisdale': 0.011,
    'forrestdale': 0.011,
    
    // NORTHERN CORRIDOR - Very strong growth (12-15% annually)
    'butler': 0.012,          // 15.4% annually
    'jindalee': 0.012,
    'clarkson': 0.011,
    'mindarie': 0.010,
    'quinns rocks': 0.010,
    'yanchep': 0.013,         // 16.7% annually (high growth area)
    'alkimos': 0.013,
    'eglinton': 0.013,
    'two rocks': 0.012,
    
    // OUTER SUBURBS - Mixed growth (7-12% annually)
    'ellenbrook': 0.011,      // 14% annually
    'aveley': 0.011,
    'the vines': 0.008,       // 10% annually
    'henley brook': 0.009,
    'caversham': 0.009,
    'west swan': 0.009,
    'ballajura': 0.010,
    'alexander heights': 0.010,
    'girrawheen': 0.010,
    'balga': 0.010,
    'mirrabooka': 0.010,
    'westminster': 0.010,
    'landsdale': 0.010,
    'madeley': 0.010,
    
    // HILLS - Moderate growth (7-9% annually)
    'kalamunda': 0.007,       // 8.7% annually
    'lesmurdie': 0.007,
    'forrestfield': 0.008,
    'high wycombe': 0.008,
    'maida vale': 0.008,
    
    // WESTERN SUBURBS - Steady growth (6-8% annually)
    'floreat': 0.006,         // 7.4% annually (established, stable)
    'wembley': 0.007,
    'cambridge': 0.007,
    'city beach': 0.006,
    'doubleview': 0.007,
    'joondanna': 0.008,
    'osborne park': 0.008,
    
    // ROCKINGHAM/MANDURAH - Good growth (9-12% annually)
    'rockingham': 0.009,      // 11.3% annually
    'baldivis': 0.011,        // 14% annually
    'secret harbour': 0.010,
    'golden bay': 0.010,
    'port kennedy': 0.010,
    'singleton': 0.010,
    'lakelands': 0.011,
    'mandurah': 0.009,
    'halls head': 0.009,
    'meadow springs': 0.009,
    
    // SWAN VALLEY - Moderate growth (8-10% annually)
    'middle swan': 0.008,     // 10% annually
    'guildford': 0.009,
    'south guildford': 0.009,
    'lockridge': 0.010,
    'kiara': 0.010,
    'eden hill': 0.010
  };
  
  // Get growth rate for this suburb
  let monthlyRate = suburbGrowthRates[suburb];
  
  if (monthlyRate) {
    const annualRate = ((Math.pow(1 + monthlyRate, 12) - 1) * 100).toFixed(1);
    console.log(`✓ Using ${suburb} growth rate: ${(monthlyRate * 100).toFixed(2)}% monthly (~${annualRate}% annually)`);
    return monthlyRate;
  }
  
  // Fallback: calculate average age and use conservative rate
  const avgMonthsAgo = salesWithDates.reduce((sum, s) => sum + s.monthsAgo, 0) / salesWithDates.length;
  
  let fallbackRate;
  if (avgMonthsAgo < 3) {
    fallbackRate = 0.008; // ~10% annually
  } else if (avgMonthsAgo < 6) {
    fallbackRate = 0.007; // ~8.7% annually
  } else {
    fallbackRate = 0.006; // ~7.4% annually
  }
  
  console.log(`⚠ Suburb "${suburb}" not in database, using fallback: ${(fallbackRate * 100).toFixed(2)}% monthly`);
  return fallbackRate;
}

async function extractPropertyDetails() {
  // Extract address
  const addressElement = document.querySelector('h1[class*="address"]') ||
                        document.querySelector('[class*="property-info__address"]') ||
                        document.querySelector('h1');
  
  const addressText = addressElement ? addressElement.textContent.trim() : '';
  console.log('Raw address text:', addressText);
  
  // Parse address
  const parts = addressText.split(',').map(s => s.trim());
  console.log('Address parts:', parts);
  
  const address = parts[0] || '';
  const suburb = parts[1] || '';
  const statePostcode = parts[2] || '';
  const state = statePostcode.split(' ')[0] || '';
  const postcode = statePostcode.split(' ')[1] || '';
  
  // Extract features - Look for the specific <p> elements with numbers
  let bedrooms = 0, bathrooms = 0, parking = 0, landSize = 0;
  
  // The features are in <p> tags near the address
  // Find all small <p> elements with just numbers or numbers+m²
  const allParagraphs = document.querySelectorAll('p[class*="Text"]');
  
  console.log('Found', allParagraphs.length, 'text paragraphs');
  
  const featureValues = [];
  allParagraphs.forEach(p => {
    const text = p.textContent.trim();
    // Look for single numbers or numbers with m²
    if (/^\d+$/.test(text)) {
      const num = parseInt(text);
      if (num >= 1 && num <= 20) { // Reasonable range for bed/bath/parking
        featureValues.push(num);
        console.log('Found feature value:', num);
      }
    } else if (/^\d{1,3}(,\d{3})*m[²2]$/.test(text)) {
      // Handle land size with commas like "1,087m²"
      const match = text.match(/^([\d,]+)m/);
      if (match) {
        landSize = parseInt(match[1].replace(/,/g, '')); // Remove commas before parsing
        console.log('Found land size:', landSize);
      }
    }
  });
  
  // The first 3 reasonable values are usually: bedrooms, bathrooms, parking
  // This assumes they appear in that order on the page
  if (featureValues.length >= 2) {
    bedrooms = featureValues[0];
    bathrooms = featureValues[1];
    if (featureValues.length >= 3) {
      parking = featureValues[2];
    }
  }
  
  console.log('Extracted features:', { bedrooms, bathrooms, parking, landSize });
  
  // Extract property type - it's in a <p> tag near the features
  let propertyType = 'House'; // Default
  
  const typeParagraphs = document.querySelectorAll('p[class*="Text"]');
  
  console.log(`Checking ${typeParagraphs.length} paragraphs for property type...`);
  
  typeParagraphs.forEach(p => {
    const text = p.textContent.trim().toLowerCase();
    console.log('Checking paragraph text:', text);
    // Look for property type keywords (exact match or contains)
    if (text === 'house') propertyType = 'House';
    else if (text === 'apartment' || text === 'unit') propertyType = 'Apartment';
    else if (text === 'townhouse') propertyType = 'Townhouse';
    else if (text === 'villa') propertyType = 'Villa';
    else if (text === 'land' || text === 'vacant land' || text.includes('residential land')) propertyType = 'Land';
    else if (text === 'studio') propertyType = 'Studio';
  });
  
  console.log('Property type detected:', propertyType);
  
  // Extract building age/year - look for "Built in YYYY", "New", "Brand new", etc.
  let buildingAge = null;
  let isNewBuild = false;
  
  const pageText = document.body.innerText;
  
  // Look for "Built in YYYY" or "Completed YYYY"
  const builtMatch = pageText.match(/(?:built|completed|constructed)\s+(?:in\s+)?(\d{4})/i);
  if (builtMatch) {
    const year = parseInt(builtMatch[1]);
    const currentYear = new Date().getFullYear();
    buildingAge = currentYear - year;
    if (buildingAge <= 2) isNewBuild = true;
    console.log(`Found building year: ${year} (${buildingAge} years old)`);
  }
  
  // Look for "New" or "Brand new" keywords
  if (!isNewBuild) {
    const newMatch = pageText.match(/\b(brand\s+)?new\s+(apartment|development|build|property|construction)\b/i);
    if (newMatch) {
      isNewBuild = true;
      buildingAge = 0;
      console.log('Detected as new build from keywords');
    }
  }
  
  console.log('Building age:', buildingAge, 'Is new build:', isNewBuild);
  
  // Use AI to analyze property photos for age/condition/stories if no building age found
  let aiEstimatedAge = null;
  let propertyCondition = null;
  let propertyStories = null;
  
  if (buildingAge === null && ENABLE_AI_PHOTO_ANALYSIS && OPENAI_API_KEY !== 'YOUR_OPENAI_API_KEY_HERE') {
    console.log('No building age found in text, attempting AI photo analysis...');
    try {
      const aiAnalysis = await analyzePropertyPhotosWithAI();
      if (aiAnalysis) {
        aiEstimatedAge = aiAnalysis.estimatedAge;
        propertyCondition = aiAnalysis.condition;
        buildingAge = aiEstimatedAge;
        propertyStories = aiAnalysis.stories; // Store stories from AI
        console.log('AI estimated age:', aiEstimatedAge, 'Condition:', propertyCondition, 'Stories:', propertyStories);
        console.log('AI reasoning:', aiAnalysis.reasoning);
      }
    } catch (error) {
      console.log('AI photo analysis failed:', error.message);
    }
  } else if (buildingAge === null) {
    console.log('AI photo analysis disabled or API key not configured');
  }
  
  // Detect premium features from listing text (use existing pageText in lowercase)
  const pageTextLower = pageText.toLowerCase();
  
  // Pool detection
  const hasPool = pageTextLower.match(/\b(pool|swimming\s*pool|in-?ground\s*pool|heated\s*pool)\b/i) !== null;
  if (hasPool) console.log('✓ Pool detected');
  
  // Renovation detection
  const hasRenovation = pageTextLower.match(/\b(renovated|updated|refurbished|new\s*kitchen|new\s*bathroom|modern\s*kitchen|modern\s*bathroom|recently\s*updated)\b/i) !== null;
  if (hasRenovation) console.log('✓ Recent renovation detected');
  
  // View detection
  const hasWaterView = pageTextLower.match(/\b(water\s*view|ocean\s*view|river\s*view|waterfront|beachfront|lakefront)\b/i) !== null;
  const hasCityView = pageTextLower.match(/\b(city\s*view|skyline\s*view|cbd\s*view)\b/i) !== null;
  const hasParkView = pageTextLower.match(/\b(park\s*view|bushland\s*view|nature\s*reserve)\b/i) !== null;
  if (hasWaterView) console.log('✓ Water view detected');
  if (hasCityView) console.log('✓ City view detected');
  if (hasParkView) console.log('✓ Park view detected');
  
  // NEW QUICK WIN #1: Granny flat detection (HUGE value!)
  const hasGrannyFlat = pageTextLower.match(/\b(granny\s*flat|self[- ]contained|ancillary\s*dwelling|studio\s*apartment|separate\s*living|dual\s*living)\b/i) !== null;
  if (hasGrannyFlat) console.log('✓ Granny flat detected');
  
  // NEW QUICK WIN #3: Solar panels (Perth sun!)
  const hasSolar = pageTextLower.match(/\b(solar\s*panel|solar\s*power|solar\s*system|solar\s*hot\s*water|pv\s*system)\b/i) !== null;
  if (hasSolar) console.log('✓ Solar panels detected');
  
  // NEW QUICK WIN #4: Garage vs Carport distinction
  const hasGarage = pageTextLower.match(/\b(garage|lock[- ]up\s*garage|secure\s*garage|remote\s*garage|double\s*garage|single\s*garage)\b/i) !== null;
  const hasCarport = pageTextLower.match(/\b(carport|car\s*port|covered\s*parking)\b/i) !== null;
  if (hasGarage) console.log('✓ Garage detected');
  if (hasCarport) console.log('✓ Carport detected');
  
  return {
    address,
    suburb,
    state,
    postcode,
    bedrooms,
    bathrooms,
    parking,
    landSize,
    propertyType,
    buildingAge,
    isNewBuild,
    aiEstimatedAge,
    propertyCondition,
    stories: propertyStories,
    hasPool,
    hasRenovation,
    hasWaterView,
    hasCityView,
    hasParkView,
    hasGrannyFlat,
    hasSolar,
    hasGarage,
    hasCarport
  };
}

async function analyzePropertyPhotosWithAI() {
  // Find property photos on the page - look for images with reastatic.net URLs
  const photoElements = document.querySelectorAll('img[src*="reastatic.net"], img[src*="cloudfront"], img[src*="domain"]');
  
  console.log(`Found ${photoElements.length} potential photo elements`);
  
  if (photoElements.length === 0) {
    console.log('No property photos found');
    return null;
  }
  
  // Get the first 5 photos for comprehensive analysis
  const photoUrls = Array.from(photoElements)
    .slice(0, 5)
    .map(img => img.src)
    .filter(src => src && src.startsWith('http') && !src.includes('logo') && !src.includes('icon'));
  
  console.log('Filtered photo URLs:', photoUrls);
  
  if (photoUrls.length === 0) {
    console.log('No valid photo URLs found');
    return null;
  }
  
  console.log('Analyzing photos:', photoUrls);
  
  // Call OpenAI Vision API
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o', // Updated model name
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyze these property photos and provide: 1) A SINGLE specific number for the approximate building age in years (not a range - just one number like 5, 15, or 30), 2) The condition (Excellent/Good/Fair/Poor), 3) The number of stories/levels - is it single-story (1) or double-story (2 or more)? Look at the exterior photos carefully. Consider architectural style, materials, weathering, maintenance level, fixtures, appliances, visible wear, and building height. Be precise with age and stories. Respond ONLY with JSON format: {"estimatedAge": <single number>, "condition": "<string>", "stories": <1 or 2>, "reasoning": "<brief explanation>"}'
            },
            ...photoUrls.map(url => ({
              type: 'image_url',
              image_url: { url }
            }))
          ]
        }
      ],
      max_tokens: 300
    })
  });
  
  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }
  
  const data = await response.json();
  const content = data.choices[0].message.content;
  
  console.log('OpenAI response:', content);
  
  // Parse JSON response - try multiple approaches
  let analysis = null;
  
  // Try 1: Direct JSON parse
  try {
    analysis = JSON.parse(content);
  } catch (e) {
    // Try 2: Extract JSON from markdown code blocks - be more flexible
    const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      try {
        // Clean up any extra quotes or escaping
        const jsonStr = codeBlockMatch[1].trim();
        analysis = JSON.parse(jsonStr);
        console.log('Successfully parsed from code block');
      } catch (e2) {
        console.log('Failed to parse JSON from code block:', e2.message);
      }
    }
    
    // Try 3: Find the first { to the last } in the entire response
    if (!analysis) {
      const firstBrace = content.indexOf('{');
      const lastBrace = content.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        try {
          let jsonStr = content.substring(firstBrace, lastBrace + 1);
          
          // Fix common AI formatting issues
          // Fix unquoted age ranges like: "estimatedAge": 0-20 → "estimatedAge": "0-20"
          jsonStr = jsonStr.replace(/"estimatedAge":\s*(\d+-\d+)/g, '"estimatedAge": "$1"');
          
          analysis = JSON.parse(jsonStr);
          console.log('Successfully parsed from brace extraction with fixes');
        } catch (e3) {
          console.log('Failed to parse extracted JSON:', e3.message);
        }
      }
    }
  }
  
  if (!analysis) {
    console.error('Could not parse AI response:', content);
    return null;
  }
  
  // Handle age - should be a single number, but handle ranges as fallback
  let estimatedAge = null;
  if (analysis.estimatedAge) {
    const ageStr = String(analysis.estimatedAge);
    if (ageStr.includes('-')) {
      // It's a range (shouldn't happen with new prompt, but handle it anyway)
      const [min, max] = ageStr.split('-').map(n => parseInt(n.trim()));
      estimatedAge = Math.round((min + max) / 2);
      console.log(`Age range ${ageStr} converted to midpoint: ${estimatedAge} (Note: AI should provide single number)`);
    } else {
      estimatedAge = parseInt(ageStr);
      console.log(`AI estimated age: ${estimatedAge} years`);
    }
  }
  
  // Handle stories
  let stories = null;
  if (analysis.stories) {
    stories = parseInt(analysis.stories);
    console.log(`AI estimated stories: ${stories} ${stories === 1 ? '(single-story)' : '(double-story)'}`);
  }
  
  return {
    estimatedAge,
    condition: analysis.condition || null,
    stories: stories,
    reasoning: analysis.reasoning || null
  };
}

async function enrichComparablesWithFullDetails(comparables) {
  // Fetch full listing pages for top comparables to get better feature detection
  // Limit to top 10 to avoid too many requests
  
  console.log(`Enriching ${Math.min(comparables.length, 10)} comparables with full listing data...`);
  
  const enrichedComparables = [];
  
  for (let i = 0; i < Math.min(comparables.length, 10); i++) {
    const comp = comparables[i];
    
    if (!comp.listingURL) {
      console.log(`No URL for ${comp.address}, skipping enrichment`);
      enrichedComparables.push(comp);
      continue;
    }
    
    try {
      console.log(`Fetching full listing for: ${comp.address}`);
      
      const response = await fetch(comp.listingURL);
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Get the full page text
      const fullText = doc.body.innerText.toLowerCase();
      
      // Re-detect all features with the full description
      const hasPool = fullText.match(/\b(pool|swimming\s*pool|in-?ground\s*pool|heated\s*pool)\b/i) !== null;
      const hasRenovation = fullText.match(/\b(renovated|updated|refurbished|new\s*kitchen|new\s*bathroom|modern\s*kitchen|recently\s*updated)\b/i) !== null;
      const hasWaterView = fullText.match(/\b(water\s*view|ocean\s*view|river\s*view|waterfront|beachfront)\b/i) !== null;
      const hasCityView = fullText.match(/\b(city\s*view|skyline\s*view|cbd\s*view)\b/i) !== null;
      const hasParkView = fullText.match(/\b(park\s*view|bushland\s*view|nature\s*reserve)\b/i) !== null;
      const hasGrannyFlat = fullText.match(/\b(granny\s*flat|self[- ]contained|ancillary\s*dwelling|dual\s*living)\b/i) !== null;
      const hasSolar = fullText.match(/\b(solar\s*panel|solar\s*power|solar\s*system|pv\s*system)\b/i) !== null;
      const hasGarage = fullText.match(/\b(garage|lock[- ]up\s*garage|secure\s*garage|remote\s*garage)\b/i) !== null;
      const hasCarport = fullText.match(/\b(carport|car\s*port|covered\s*parking)\b/i) !== null;
      
      // Detect stories more reliably
      let stories = comp.stories; // Keep existing if found
      if (!stories) {
        if (fullText.match(/\b(double[\s-]?stor(e)?y|two[\s-]?stor(e)?y|2[\s-]?stor(e)?y)\b/i)) {
          stories = 2;
        } else if (fullText.match(/\b(single[\s-]?stor(e)?y|one[\s-]?stor(e)?y|1[\s-]?stor(e)?y)\b/i)) {
          stories = 1;
        }
      }
      
      console.log(`Enriched ${comp.address}: pool=${hasPool}, reno=${hasRenovation}, view=${hasWaterView}, granny=${hasGrannyFlat}, solar=${hasSolar}, stories=${stories}`);
      
      // Add enriched data to comparable
      enrichedComparables.push({
        ...comp,
        hasPool,
        hasRenovation,
        hasWaterView,
        hasCityView,
        hasParkView,
        hasGrannyFlat,
        hasSolar,
        hasGarage,
        hasCarport,
        stories,
        enriched: true // Flag that we got full data
      });
      
      // Small delay to avoid hammering the server
      await new Promise(resolve => setTimeout(resolve, 300));
      
    } catch (error) {
      console.log(`Failed to fetch full listing for ${comp.address}:`, error.message);
      // Keep original data if fetch fails
      enrichedComparables.push(comp);
    }
  }
  
  // Add remaining comparables without enrichment
  for (let i = 10; i < comparables.length; i++) {
    enrichedComparables.push(comparables[i]);
  }
  
  console.log(`Enrichment complete. ${enrichedComparables.filter(c => c.enriched).length} comparables enriched.`);
  
  return enrichedComparables;
}

async function getValuation(property) {
  // Build sold listings URL with property type in the path for land
  let soldURL;
  
  if (property.propertyType === 'Land') {
    // For land, use property-land in the URL path
    soldURL = `https://www.realestate.com.au/sold/property-land-in-${property.suburb.toLowerCase().replace(/\s+/g, '-')},+${property.state.toLowerCase()}+${property.postcode}/list-1?activeSort=solddate`;
  } else {
    // For other property types, use standard URL
    soldURL = `https://www.realestate.com.au/sold/in-${property.suburb.toLowerCase().replace(/\s+/g, '-')},+${property.state.toLowerCase()}+${property.postcode}/list-1?activeSort=solddate`;
  }
  
  console.log('Fetching sold listings from:', soldURL);
  
  try {
    const response = await fetch(soldURL);
    const html = await response.text();
    
    // Parse HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Get all sold property cards
    const propertyCards = doc.querySelectorAll('article.residential-card[data-testid="ResidentialCard"]');
    console.log(`Found ${propertyCards.length} sold properties`);
    
    if (propertyCards.length === 0) {
      throw new Error('No sold properties found in this area');
    }
    
    const comparables = [];
    
    // Use 12 months lookback for all property types (we adjust for growth anyway)
    const monthsBack = 12;
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsBack);
    
    console.log(`Using ${monthsBack} month lookback period for ${property.propertyType} (cutoff: ${cutoffDate.toLocaleDateString()})`);
    
    propertyCards.forEach((card, index) => {
      if (comparables.length >= 20) return;
      
      try {
        // Extract price
        const priceEl = card.querySelector('.property-price');
        if (!priceEl) return;
        
        const priceText = priceEl.textContent.trim();
        console.log('Raw price text:', priceText);
        
        // Remove everything except digits to get the full number
        const priceDigits = priceText.replace(/[^0-9]/g, '');
        const price = parseInt(priceDigits);
        
        console.log('Parsed price:', price);
        
        if (!price || price < 100000 || price > 10000000) {
          console.log('Price rejected:', price);
          return;
        }
        
        // Extract address and URL
        const addressEl = card.querySelector('h2.residential-card__address-heading, .residential-card__details-link span');
        const address = addressEl ? addressEl.textContent.trim() : '';
        
        // Extract the URL to the full listing page
        const linkEl = card.querySelector('a.residential-card__details-link, a[href*="/property-"]');
        let listingURL = null;
        if (linkEl) {
          const href = linkEl.getAttribute('href');
          if (href) {
            // Convert relative URL to absolute
            listingURL = href.startsWith('http') ? href : `https://www.realestate.com.au${href}`;
            console.log(`Found listing URL: ${listingURL}`);
          }
        }
        
        // Extract sold date
        let soldDate = '';
        const spans = card.querySelectorAll('span');
        for (let span of spans) {
          const text = span.textContent.toLowerCase();
          if (text.includes('sold on') || text.includes('sold date')) {
            soldDate = span.textContent.trim();
            break;
          }
        }
        
        // Check if sold within the time window
        if (soldDate) {
          const dateMatch = soldDate.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
          if (dateMatch) {
            const [, day, month, year] = dateMatch;
            const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
            const monthIndex = months.findIndex(m => month.toLowerCase().startsWith(m));
            if (monthIndex !== -1) {
              const saleDate = new Date(parseInt(year), monthIndex, parseInt(day));
              if (saleDate < cutoffDate) {
                return; // Skip properties older than cutoff
              }
            }
          }
        }
        
        // Extract features from aria-labels
        let beds = 0, baths = 0, cars = 0, land = 0;
        
        const features = card.querySelectorAll('li[aria-label]');
        features.forEach(li => {
          const label = li.getAttribute('aria-label').toLowerCase();
          
          if (label.includes('bedroom')) {
            beds = parseInt(label.match(/\d+/)?.[0] || '0');
          } else if (label.includes('bathroom')) {
            baths = parseInt(label.match(/\d+/)?.[0] || '0');
          } else if (label.includes('parking') || label.includes('garage') || label.includes('car')) {
            cars = parseInt(label.match(/\d+/)?.[0] || '0');
          } else if (label.includes('land')) {
            // Handle land sizes with commas like "1,087 m²"
            const match = label.match(/([\d,]+)\s*m/i);
            if (match) land = parseInt(match[1].replace(/,/g, ''));
          }
        });
        
        // Extract property type - check all p tags in the card
        let type = 'House';
        const allPs = card.querySelectorAll('p');
        allPs.forEach(p => {
          const text = p.textContent.trim().toLowerCase();
          if (text === 'house') type = 'House';
          else if (text === 'apartment' || text === 'unit') type = 'Apartment';
          else if (text === 'townhouse') type = 'Townhouse';
          else if (text === 'villa') type = 'Villa';
          else if (text === 'land' || text === 'vacant land' || text.includes('residential land')) type = 'Land';
          else if (text === 'studio') type = 'Studio';
        });
        
        console.log(`Extracted property: ${address} - Type: ${type}`);
        
        // Try to extract building age/year from the card text
        let buildingAge = null;
        let isNewBuild = false;
        const cardText = card.textContent;
        
        const builtMatch = cardText.match(/(?:built|completed)\s+(?:in\s+)?(\d{4})/i);
        if (builtMatch) {
          const year = parseInt(builtMatch[1]);
          buildingAge = new Date().getFullYear() - year;
          if (buildingAge <= 2) isNewBuild = true;
        }
        
        if (!isNewBuild && cardText.match(/\b(brand\s+)?new\b/i)) {
          isNewBuild = true;
          buildingAge = 0;
        }
        
        // Detect stories from text (simple heuristic for comparables)
        let stories = null;
        if (cardText.match(/\b(double[\s-]?stor(e)?y|two[\s-]?stor(e)?y|2[\s-]?stor(e)?y)\b/i)) {
          stories = 2;
        } else if (cardText.match(/\b(single[\s-]?stor(e)?y|one[\s-]?stor(e)?y|1[\s-]?stor(e)?y)\b/i)) {
          stories = 1;
        }
        
        // Detect premium features from comparable text
        const cardTextLower = cardText.toLowerCase();
        const hasPool = cardTextLower.match(/\b(pool|swimming\s*pool)\b/) !== null;
        const hasRenovation = cardTextLower.match(/\b(renovated|updated|refurbished|new\s*kitchen)\b/) !== null;
        const hasWaterView = cardTextLower.match(/\b(water\s*view|ocean\s*view|river\s*view)\b/) !== null;
        const hasCityView = cardTextLower.match(/\b(city\s*view|skyline\s*view)\b/) !== null;
        const hasParkView = cardTextLower.match(/\b(park\s*view|bushland\s*view)\b/) !== null;
        
        // NEW: Quick win features (reduced set)
        const hasGrannyFlat = cardTextLower.match(/\b(granny\s*flat|self[- ]contained|ancillary|dual\s*living)\b/) !== null;
        const hasSolar = cardTextLower.match(/\b(solar\s*panel|solar\s*power|solar\s*system)\b/) !== null;
        const hasGarage = cardTextLower.match(/\b(garage|lock[- ]up\s*garage|secure\s*garage)\b/) !== null;
        const hasCarport = cardTextLower.match(/\b(carport|car\s*port)\b/) !== null;
        
        comparables.push({
          address,
          price: parseInt(price),
          bedrooms: parseInt(beds) || 0,
          bathrooms: parseInt(baths) || 0,
          parking: parseInt(cars) || 0,
          landSize: parseInt(land) || 0,
          propertyType: type,
          soldDate,
          buildingAge,
          isNewBuild,
          stories,
          hasPool,
          hasRenovation,
          hasWaterView,
          hasCityView,
          hasParkView,
          hasGrannyFlat,
          hasSolar,
          hasGarage,
          hasCarport,
          listingURL  // Store the URL for later fetching
        });
        
      } catch (err) {
        console.error('Error parsing property card:', err);
      }
    });
    
    console.log(`Found ${comparables.length} valid comparables within last ${monthsBack} months`);
    
    // Log property types found
    const typeBreakdown = {};
    comparables.forEach(c => {
      typeBreakdown[c.propertyType] = (typeBreakdown[c.propertyType] || 0) + 1;
    });
    console.log('Property types in comparables:', typeBreakdown);
    
    if (comparables.length === 0) {
      throw new Error(`No comparable properties found in the last ${monthsBack} months`);
    }
    
    // FILTER: Only use comparables with matching property type
    const matchingTypeComparables = comparables.filter(comp => 
      comp.propertyType === property.propertyType
    );
    
    console.log(`Filtered to ${matchingTypeComparables.length} comparables matching property type: ${property.propertyType}`);
    
    let finalComparables;
    
    // Special handling for LAND - don't filter by bed/bath (there are none!)
    if (property.propertyType === 'Land') {
      // For land, just use all matching type comparables
      finalComparables = matchingTypeComparables;
      console.log(`Land property - using all ${finalComparables.length} land comparables`);
    } else {
      // For houses/apartments - PREFER exact bedroom match, but allow flexibility
      
      // First try: exact bedroom matches
      const exactBedroomMatches = matchingTypeComparables.filter(comp =>
        comp.bedrooms === property.bedrooms
      );
      
      console.log(`Found ${exactBedroomMatches.length} comparables with exact ${property.bedrooms} bedroom match`);
      
      if (exactBedroomMatches.length >= 3) {
        // Enough exact matches - use only those
        finalComparables = exactBedroomMatches;
        console.log(`✓ Using ${finalComparables.length} exact bedroom matches`);
      } else {
        // Not enough exact matches - try ±1 bedroom
        const flexibleMatches1 = matchingTypeComparables.filter(comp =>
          Math.abs(comp.bedrooms - property.bedrooms) <= 1
        );
        
        console.log(`Expanding to ±1 bedroom: ${flexibleMatches1.length} comparables`);
        
        if (flexibleMatches1.length >= 3) {
          // Enough with ±1
          finalComparables = flexibleMatches1;
          console.log(`✓ Using ${finalComparables.length} comparables (±1 bedroom)`);
        } else {
          // Still not enough - try ±2 bedrooms
          const flexibleMatches2 = matchingTypeComparables.filter(comp =>
            Math.abs(comp.bedrooms - property.bedrooms) <= 2
          );
          
          console.log(`Expanding to ±2 bedrooms: ${flexibleMatches2.length} comparables`);
          finalComparables = flexibleMatches2;
          
          if (finalComparables.length === 0) {
            throw new Error(`No ${property.bedrooms} bedroom ${property.propertyType} comparables found in the last ${monthsBack} months (searched ±2 bedrooms)`);
          } else {
            console.log(`✓ Using ${finalComparables.length} comparables (±2 bedrooms - wider search)`);
          }
        }
      }
    }
    
    if (finalComparables.length === 0) {
      throw new Error(`No comparable ${property.propertyType} found in the last ${monthsBack} months`);
    }
    
    // ENRICH: Fetch full listing pages for top comparables to get better feature detection
    console.log('🔍 Fetching full listing pages for better feature detection...');
    const enrichedComparables = await enrichComparablesWithFullDetails(finalComparables);
    
    // Calculate suburb growth rate from comparables
    const monthlyGrowthRate = calculateGrowthRate(enrichedComparables);
    console.log(`Calculated suburb growth rate: ${(monthlyGrowthRate * 12 * 100).toFixed(1)}% annually (${(monthlyGrowthRate * 100).toFixed(2)}% monthly)`);
    
    // Calculate valuation with adjustments (weighted median handles outliers)
    const valuation = calculateValuation(property, enrichedComparables, monthlyGrowthRate);
    
    return valuation;
    
  } catch (error) {
    console.error('Error fetching comparables:', error);
    throw error;
  }
}

function calculateValuation(property, comparables, monthlyGrowthRate) {
  // Determine land value per sqm based on suburb
  let LAND_VALUE_PER_SQM = 250; // Default for outer suburbs
  
  const suburb = property.suburb.toLowerCase();
  
  // Inner suburbs - premium land value
  const innerSuburbs = ['south perth', 'subiaco', 'leederville', 'mount lawley', 'nedlands', 'claremont', 'cottesloe', 'mosman park', 'peppermint grove', 'north perth', 'highgate', 'west perth', 'east perth', 'perth', 'northbridge', 'victoria park', 'como', 'applecross', 'ardross', 'mt lawley', 'maylands'];
  
  // Mid-tier suburbs
  const midTierSuburbs = ['floreat', 'wembley', 'cambridge', 'osborne park', 'scarborough', 'doubleview', 'churchlands', 'karrinyup', 'stirling', 'joondanna', 'dianella', 'morley', 'bayswater', 'bassendean', 'embleton', 'willetton', 'riverton', 'shelley', 'rossmoyne', 'bateman', 'bull creek', 'leeming', 'kardinya', 'murdoch', 'winthrop', 'booragoon', 'melville', 'bicton', 'palmyra', 'hilton', 'white gum valley', 'beaconsfield', 'fremantle', 'hamilton hill', 'coolbellup', 'spearwood', 'coogee', 'south beach', 'north beach', 'watermans bay', 'sorrento', 'hillarys', 'padbury', 'craigie', 'beldon', 'greenwood'];
  
  if (innerSuburbs.includes(suburb)) {
    LAND_VALUE_PER_SQM = 600;
    console.log(`Using inner suburb rate: $${LAND_VALUE_PER_SQM}/m² for ${property.suburb}`);
  } else if (midTierSuburbs.includes(suburb)) {
    LAND_VALUE_PER_SQM = 400;
    console.log(`Using mid-tier suburb rate: $${LAND_VALUE_PER_SQM}/m² for ${property.suburb}`);
  } else {
    LAND_VALUE_PER_SQM = 250;
    console.log(`Using outer suburb rate: $${LAND_VALUE_PER_SQM}/m² for ${property.suburb}`);
  }
  
  // For vacant land, land size is EVERYTHING - use much higher weight
  const isLand = property.propertyType === 'Land';
  if (isLand) {
    // Vacant land has completely different pricing than land under houses
    // Reset to proper vacant land rates by suburb tier
    if (innerSuburbs.includes(suburb)) {
      LAND_VALUE_PER_SQM = 2500; // Inner suburbs: $2,500-3,000/m²
      console.log(`Vacant land in inner suburb: $${LAND_VALUE_PER_SQM}/m² for ${property.suburb}`);
    } else if (midTierSuburbs.includes(suburb)) {
      LAND_VALUE_PER_SQM = 1500; // Mid-tier suburbs: $1,500-2,000/m²
      console.log(`Vacant land in mid-tier suburb: $${LAND_VALUE_PER_SQM}/m² for ${property.suburb}`);
    } else {
      LAND_VALUE_PER_SQM = 1000; // Outer suburbs: $1,000/m²
      console.log(`Vacant land in outer suburb: $${LAND_VALUE_PER_SQM}/m² for ${property.suburb}`);
    }
    
    // Apply block size scaling: smaller blocks = premium $/m², larger blocks = discount $/m²
    // Use the target property's land size as the reference
    const targetLandSize = parseInt(property.landSize) || 600; // Default 600m² if not found
    
    // Scaling formula: 
    // - 300m² block: +30% premium (×1.3)
    // - 600m² block: baseline (×1.0)
    // - 1000m² block: -20% discount (×0.8)
    // - 2000m² block: -40% discount (×0.6)
    
    const baseSize = 600; // Reference size
    let sizeMultiplier = 1.0;
    
    if (targetLandSize < baseSize) {
      // Smaller blocks = premium (up to +50% for very small blocks)
      const percentSmaller = (baseSize - targetLandSize) / baseSize;
      sizeMultiplier = 1 + (percentSmaller * 0.8); // Max +80% for tiny blocks
    } else if (targetLandSize > baseSize) {
      // Larger blocks = discount (up to -50% for huge blocks)
      const percentLarger = (targetLandSize - baseSize) / baseSize;
      sizeMultiplier = 1 / (1 + (percentLarger * 0.5)); // Diminishing returns
    }
    
    LAND_VALUE_PER_SQM = Math.round(LAND_VALUE_PER_SQM * sizeMultiplier);
    console.log(`Block size scaling applied: ${targetLandSize}m² → multiplier ${sizeMultiplier.toFixed(2)} → $${LAND_VALUE_PER_SQM}/m²`);
  }
  
  // Calculate adjusted prices and similarity scores
  const adjustedComparables = comparables.map(comp => {
    let adjustedPrice = parseInt(comp.price);
    let similarityScore = 100;
    const adjustments = []; // Track all adjustments for display
    const similarityFactors = []; // Track similarity impacts
    
    // Ensure all values are integers
    const targetBaths = parseInt(property.bathrooms) || 0;
    const targetLand = parseInt(property.landSize) || 0;
    const compBaths = parseInt(comp.bathrooms) || 0;
    const compLand = parseInt(comp.landSize) || 0;
    
    // ADJUST: Bedroom difference (now allowed ±2 with scaling penalty)
    const targetBeds = parseInt(property.bedrooms) || 0;
    const compBeds = parseInt(comp.bedrooms) || 0;
    const bedroomDiff = targetBeds - compBeds;
    
    if (bedroomDiff !== 0) {
      // Bedrooms are worth ~8% of property value each (significant!)
      const BEDROOM_PERCENT = 0.08;
      const bedroomAdjustment = adjustedPrice * bedroomDiff * BEDROOM_PERCENT;
      adjustedPrice += bedroomAdjustment;
      
      // Scaling penalty: -30 for ±1, -60 for ±2
      const penaltyPerBed = 30;
      similarityScore -= Math.abs(bedroomDiff) * penaltyPerBed;
      
      console.log(`Bedroom adjustment for ${comp.address}: ${targetBeds} vs ${compBeds} beds = ${bedroomDiff} diff → ${bedroomDiff > 0 ? '+' : ''}$${Math.round(bedroomAdjustment)} (${BEDROOM_PERCENT * 100}%)`);
    }
    
    const BATHROOM_PERCENT = 0.05; // 5% of property value per bathroom (was 6%)
    
    // Adjust for bathroom difference (percentage-based scales with property value)
    const bathroomDiff = targetBaths - compBaths;
    if (bathroomDiff !== 0) {
      const bathroomAdjustment = adjustedPrice * bathroomDiff * BATHROOM_PERCENT;
      adjustedPrice += bathroomAdjustment;
      similarityScore -= Math.abs(bathroomDiff) * 5; // -5 points per bathroom difference
      console.log(`Bathroom adjustment for ${comp.address}: ${targetBaths} vs ${compBaths} baths = ${bathroomDiff} diff → ${bathroomDiff > 0 ? '+' : ''}$${Math.round(bathroomAdjustment)} (${BATHROOM_PERCENT * 100}%)`);
    }
    
    // BOOST: Perfect bed/bath match gets bonus
    if (bedroomDiff === 0 && bathroomDiff === 0) {
      similarityScore += 50;
      console.log(`Perfect bed/bath match bonus for ${comp.address}`);
    } else if (bedroomDiff === 0) {
      similarityScore += 30; // Bedrooms match, bathrooms differ
    }
    
    // BOOST: Recent sales get bonus points
    if (comp.soldDate) {
      const soldDateText = comp.soldDate.toLowerCase();
      const dateMatch = soldDateText.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
      
      if (dateMatch) {
        const [, day, month, year] = dateMatch;
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const monthIndex = months.findIndex(m => month.toLowerCase().startsWith(m));
        
        if (monthIndex !== -1) {
          const saleDate = new Date(parseInt(year), monthIndex, parseInt(day));
          const today = new Date();
          const daysAgo = Math.floor((today - saleDate) / (1000 * 60 * 60 * 24));
          const monthsAgo = daysAgo / 30;
          
          // Bonus points based on recency (max 30 days = +20 points, 90 days = +10 points)
          if (daysAgo <= 30) {
            similarityScore += 20;
            console.log(`Recent sale bonus (+20) for ${comp.address} - ${daysAgo} days ago`);
          } else if (daysAgo <= 60) {
            similarityScore += 15;
            console.log(`Recent sale bonus (+15) for ${comp.address} - ${daysAgo} days ago`);
          } else if (daysAgo <= 90) {
            similarityScore += 10;
            console.log(`Recent sale bonus (+10) for ${comp.address} - ${daysAgo} days ago`);
          }
          
          // MARKET GROWTH ADJUSTMENT: Account for property value growth since sale date
          // Use calculated monthly growth rate from comparables
          
          if (!monthlyGrowthRate) {
            monthlyGrowthRate = 0.01; // Default 1% monthly if not provided
          }
          
          console.log(`Applying growth rate: ${(monthlyGrowthRate * 100).toFixed(2)}% monthly`);
          
          // Apply compound growth for the months elapsed
          const growthMultiplier = Math.pow(1 + monthlyGrowthRate, monthsAgo);
          const growthAdjustment = adjustedPrice * (growthMultiplier - 1);
          
          if (monthsAgo > 0.5) { // Only adjust if more than 2 weeks old
            const growthAdjustment = adjustedPrice * (growthMultiplier - 1);
            adjustedPrice = Math.round(adjustedPrice * growthMultiplier);
            comp.marketGrowthAdjustment = Math.round(growthAdjustment); // Store for summary
            comp.monthsAgo = monthsAgo;
            console.log(`Market growth adjustment for ${comp.address}: ${monthsAgo.toFixed(1)} months ago × ${(monthlyGrowthRate * 100).toFixed(1)}%/month = +$${Math.round(growthAdjustment)} (${((growthMultiplier - 1) * 100).toFixed(1)}% total)`);
          }
        }
      }
    }
    
    // ADJUST: Building age difference (critical for apartments!)
    if (property.buildingAge !== null && comp.buildingAge !== null) {
      const ageDiff = comp.buildingAge - property.buildingAge;
      
      // For apartments/units: age matters A LOT
      // New apartment vs 20-year-old can be $500k+ difference
      if (property.propertyType === 'Apartment' || property.propertyType === 'Unit' || property.propertyType === 'Studio') {
        // Depreciation: ~2-3% per year for first 20 years, then flattens
        const depreciationRate = ageDiff <= 20 ? 0.025 : 0.015;
        const ageAdjustment = adjustedPrice * ageDiff * depreciationRate;
        adjustedPrice -= ageAdjustment;
        
        console.log(`Age adjustment for ${comp.address}: ${comp.buildingAge}y vs ${property.buildingAge}y = ${ageDiff}y diff → ${ageAdjustment > 0 ? '-' : '+'}$${Math.abs(Math.round(ageAdjustment))}`);
        
        // Similarity penalty for age difference
        similarityScore -= Math.abs(ageDiff) * 2; // -2 points per year difference
      }
      // For houses: age matters less (land value dominates)
      else {
        const ageAdjustment = adjustedPrice * ageDiff * 0.01; // 1% per year
        adjustedPrice -= ageAdjustment;
        similarityScore -= Math.abs(ageDiff);
      }
    }
    
    // BOOST: Similar age gets bonus
    if (property.buildingAge !== null && comp.buildingAge !== null) {
      const ageDiff = Math.abs(comp.buildingAge - property.buildingAge);
      if (ageDiff <= 5) {
        similarityScore += 15;
        console.log(`Similar age bonus for ${comp.address}`);
      }
    }
    
    // ADJUST: Stories difference (single vs double story) - only for houses
    if (property.propertyType === 'House' && property.stories && comp.stories) {
      if (property.stories !== comp.stories) {
        // Double story houses are worth ~9% more than single story (more living space)
        const storiesDiff = comp.stories - property.stories;
        let storiesAdjustment = 0;
        
        if (storiesDiff > 0) {
          // Comparable is double story, target is single → adjust DOWN
          storiesAdjustment = adjustedPrice * 0.09; // -9% for single story (was 18%)
          adjustedPrice -= storiesAdjustment;
          console.log(`Stories adjustment for ${comp.address}: ${comp.stories}-story vs ${property.stories}-story → -$${Math.round(storiesAdjustment)} (-9%)`);
        } else {
          // Comparable is single story, target is double → adjust UP
          storiesAdjustment = adjustedPrice * 0.09; // +9% for double story (was 18%)
          adjustedPrice += storiesAdjustment;
          console.log(`Stories adjustment for ${comp.address}: ${comp.stories}-story vs ${property.stories}-story → +$${Math.round(storiesAdjustment)} (+9%)`);
        }
        
        // Similarity penalty for different stories
        similarityScore -= 15;
      } else {
        // Same stories - bonus
        similarityScore += 10;
        console.log(`Same stories bonus for ${comp.address}: both ${property.stories}-story`);
      }
    }
    
    // ADJUST: Pool (high impact feature!)
    if (property.hasPool !== comp.hasPool) {
      let poolValue;
      if (property.propertyType === 'House') {
        poolValue = 55000; // $55k for house pools
      } else if (property.propertyType === 'Apartment' || property.propertyType === 'Unit') {
        poolValue = 15000; // $15k premium for apartment with pool access
      } else {
        poolValue = 40000; // Default
      }
      
      if (property.hasPool && !comp.hasPool) {
        // Target has pool, comparable doesn't → adjust UP
        adjustedPrice += poolValue;
        console.log(`Pool adjustment for ${comp.address}: target has pool → +$${poolValue}`);
      } else if (!property.hasPool && comp.hasPool) {
        // Comparable has pool, target doesn't → adjust DOWN
        adjustedPrice -= poolValue;
        console.log(`Pool adjustment for ${comp.address}: comparable has pool → -$${poolValue}`);
      }
      
      similarityScore -= 8; // Penalty for pool mismatch
    } else if (property.hasPool && comp.hasPool) {
      similarityScore += 5; // Bonus for both having pools
    }
    
    // ADJUST: Renovations (7% value add - was 12%)
    if (property.hasRenovation !== comp.hasRenovation) {
      const renoPercent = 0.07; // 7% average value add (was 12%)
      const renoAdjustment = adjustedPrice * renoPercent;
      
      if (property.hasRenovation && !comp.hasRenovation) {
        // Target is renovated, comparable is not → adjust UP
        adjustedPrice += renoAdjustment;
        console.log(`Renovation adjustment for ${comp.address}: target renovated → +$${Math.round(renoAdjustment)} (+${renoPercent * 100}%)`);
      } else if (!property.hasRenovation && comp.hasRenovation) {
        // Comparable is renovated, target is not → adjust DOWN
        adjustedPrice -= renoAdjustment;
        console.log(`Renovation adjustment for ${comp.address}: comparable renovated → -$${Math.round(renoAdjustment)} (-${renoPercent * 100}%)`);
      }
      
      similarityScore -= 10; // Penalty for renovation mismatch
    } else if (property.hasRenovation && comp.hasRenovation) {
      similarityScore += 8; // Bonus for both renovated
    }
    
    // ADJUST: Water views (12% premium - was 20%)
    if (property.hasWaterView !== comp.hasWaterView) {
      const viewPercent = 0.12; // 12% average premium (was 20%)
      const viewAdjustment = adjustedPrice * viewPercent;
      
      if (property.hasWaterView && !comp.hasWaterView) {
        adjustedPrice += viewAdjustment;
        console.log(`Water view adjustment for ${comp.address}: target has view → +$${Math.round(viewAdjustment)} (+${viewPercent * 100}%)`);
      } else {
        adjustedPrice -= viewAdjustment;
        console.log(`Water view adjustment for ${comp.address}: comparable has view → -$${Math.round(viewAdjustment)} (-${viewPercent * 100}%)`);
      }
      
      similarityScore -= 12; // Big penalty for view mismatch
    } else if (property.hasWaterView && comp.hasWaterView) {
      similarityScore += 10; // Big bonus for both having views
    }
    
    // ADJUST: City views (8% premium - was 12%)
    if (property.hasCityView !== comp.hasCityView) {
      const viewPercent = 0.08; // 8% average premium (was 12%)
      const viewAdjustment = adjustedPrice * viewPercent;
      
      if (property.hasCityView && !comp.hasCityView) {
        adjustedPrice += viewAdjustment;
        console.log(`City view adjustment for ${comp.address}: target has view → +$${Math.round(viewAdjustment)} (+${viewPercent * 100}%)`);
      } else {
        adjustedPrice -= viewAdjustment;
        console.log(`City view adjustment for ${comp.address}: comparable has view → -$${Math.round(viewAdjustment)} (-${viewPercent * 100}%)`);
      }
      
      similarityScore -= 8;
    } else if (property.hasCityView && comp.hasCityView) {
      similarityScore += 6;
    }
    
    // ADJUST: Park views (5% premium - was 6%)
    if (property.hasParkView !== comp.hasParkView) {
      const viewPercent = 0.05; // 5% average premium (was 6%)
      const viewAdjustment = adjustedPrice * viewPercent;
      
      if (property.hasParkView && !comp.hasParkView) {
        adjustedPrice += viewAdjustment;
        console.log(`Park view adjustment for ${comp.address}: target has view → +$${Math.round(viewAdjustment)} (+${viewPercent * 100}%)`);
      } else {
        adjustedPrice -= viewAdjustment;
        console.log(`Park view adjustment for ${comp.address}: comparable has view → -$${Math.round(viewAdjustment)} (-${viewPercent * 100}%)`);
      }
      
      similarityScore -= 5;
    } else if (property.hasParkView && comp.hasParkView) {
      similarityScore += 4;
    }
    
    
    // NEW QUICK WIN #1: Granny flat (HUGE value - rental income potential!)
    if (property.hasGrannyFlat !== comp.hasGrannyFlat) {
      const grannyFlatValue = property.propertyType === 'House' ? 100000 : 60000;
      
      if (property.hasGrannyFlat && !comp.hasGrannyFlat) {
        adjustedPrice += grannyFlatValue;
        console.log(`Granny flat adjustment for ${comp.address}: target has granny flat → +$${grannyFlatValue}`);
      } else {
        adjustedPrice -= grannyFlatValue;
        console.log(`Granny flat adjustment for ${comp.address}: comparable has granny flat → -$${grannyFlatValue}`);
      }
      
      similarityScore -= 20; // HUGE penalty - totally different property
    } else if (property.hasGrannyFlat && comp.hasGrannyFlat) {
      similarityScore += 15; // Big bonus for both having granny flat
    }
    
    
    // NEW QUICK WIN #3: Solar panels (Perth sun = savings!)
    if (property.hasSolar !== comp.hasSolar) {
      const solarValue = 12000; // $12k for solar system
      
      if (property.hasSolar && !comp.hasSolar) {
        adjustedPrice += solarValue;
        console.log(`Solar adjustment for ${comp.address}: target has solar → +$${solarValue}`);
      } else {
        adjustedPrice -= solarValue;
        console.log(`Solar adjustment for ${comp.address}: comparable has solar → -$${solarValue}`);
      }
      
      similarityScore -= 5; // Small penalty for solar difference
    } else if (property.hasSolar && comp.hasSolar) {
      similarityScore += 4; // Bonus for both having solar
    }
    
    // NEW QUICK WIN #4: Garage vs Carport
    if (property.hasGarage !== comp.hasGarage || property.hasCarport !== comp.hasCarport) {
      // Garage > Carport > Nothing
      let parkingTypeValue = 0;
      
      if (property.hasGarage && !comp.hasGarage && !comp.hasCarport) {
        parkingTypeValue = 20000; // Target has garage, comp has neither
      } else if (property.hasGarage && comp.hasCarport) {
        parkingTypeValue = 15000; // Target has garage, comp has carport
      } else if (property.hasCarport && !comp.hasGarage && !comp.hasCarport) {
        parkingTypeValue = 10000; // Target has carport, comp has neither
      } else if (!property.hasGarage && !property.hasCarport && comp.hasGarage) {
        parkingTypeValue = -20000; // Comp has garage, target has neither
      } else if (!property.hasGarage && !property.hasCarport && comp.hasCarport) {
        parkingTypeValue = -10000; // Comp has carport, target has neither
      } else if (property.hasCarport && comp.hasGarage) {
        parkingTypeValue = -15000; // Comp has garage, target has carport
      }
      
      if (parkingTypeValue !== 0) {
        adjustedPrice += parkingTypeValue;
        console.log(`Parking type adjustment for ${comp.address}: ${parkingTypeValue > 0 ? '+' : ''}$${parkingTypeValue}`);
        similarityScore -= 6; // Penalty for parking type difference
      }
    } else if ((property.hasGarage && comp.hasGarage) || (property.hasCarport && comp.hasCarport)) {
      similarityScore += 4; // Bonus for same parking type
    }
    
    
    // Adjust for land size difference (if both have land size)
    if (targetLand && compLand) {
      const landDiff = targetLand - compLand;
      
      if (isLand) {
        // For vacant land, calculate the $/m² from this comparable and apply to target size
        // IMPORTANT: Use the ORIGINAL price (before growth), then growth will be added after
        const pricePerSqm = comp.price / compLand;
        const targetValueFromComp = targetLand * pricePerSqm;
        
        // Calculate how much growth has already been applied
        const growthAmount = adjustedPrice - comp.price;
        
        // Set the size-adjusted price, then add the growth back
        adjustedPrice = targetValueFromComp + growthAmount;
        
        console.log(`Land size adjustment for ${comp.address}: ${compLand}m² @ $${Math.round(pricePerSqm)}/m² → ${targetLand}m² = $${Math.round(targetValueFromComp)} + growth $${Math.round(growthAmount)} = $${Math.round(adjustedPrice)}`);
        
        // Still penalize similarity if sizes are very different
        const sizeDiffPercent = Math.abs(landDiff) / targetLand;
        if (sizeDiffPercent > 0.2) { // Penalize if >20% different
          const penalty = sizeDiffPercent * 15;
          similarityScore -= penalty;
          console.log(`Large size difference penalty: ${(sizeDiffPercent * 100).toFixed(0)}% different → -${penalty.toFixed(1)} similarity points`);
        }
      } else {
        // For houses/apartments, land size adds value on top of the building
        const landAdjustment = landDiff * LAND_VALUE_PER_SQM;
        console.log(`Land adjustment for ${comp.address}: ${targetLand}m² - ${compLand}m² = ${landDiff}m² × $${LAND_VALUE_PER_SQM} = $${landAdjustment}`);
        adjustedPrice += landAdjustment;
        
        // ENHANCED: Much stronger similarity penalty for land size differences
        // Land is a MAJOR factor - houses with very different land sizes aren't good comparables
        const landDiffPercent = Math.abs(landDiff) / targetLand;
        
        if (landDiffPercent > 0.50) {
          // >50% different: HUGE penalty
          similarityScore -= 40;
          console.log(`MAJOR land size mismatch: ${(landDiffPercent * 100).toFixed(0)}% different → -40 similarity`);
        } else if (landDiffPercent > 0.30) {
          // 30-50% different: Large penalty
          similarityScore -= 25;
          console.log(`Large land size difference: ${(landDiffPercent * 100).toFixed(0)}% different → -25 similarity`);
        } else if (landDiffPercent > 0.15) {
          // 15-30% different: Medium penalty
          similarityScore -= 15;
          console.log(`Medium land size difference: ${(landDiffPercent * 100).toFixed(0)}% different → -15 similarity`);
        } else {
          // <15% different: Small penalty
          const penalty = landDiffPercent * 50; // Up to -7.5 points
          similarityScore -= penalty;
          console.log(`Small land size difference: ${(landDiffPercent * 100).toFixed(0)}% different → -${penalty.toFixed(1)} similarity`);
        }
      }
    }
    
    // Property type match
    if (property.propertyType !== comp.propertyType) {
      similarityScore -= 20;
    }
    
    // Ensure similarity score is a valid number between 0-170 (higher cap for perfect matches + recency)
    similarityScore = Math.max(0, Math.min(170, similarityScore));
    
    // Ensure adjusted price is a valid number
    if (isNaN(adjustedPrice) || adjustedPrice <= 0) {
      console.error('Invalid adjusted price for', comp.address, adjustedPrice);
      adjustedPrice = comp.price;
      similarityScore = 50;
    }
    
    return {
      ...comp,
      adjustedPrice: Math.round(adjustedPrice),
      similarityScore: Math.round(similarityScore),
      adjustmentSummary: generateAdjustmentSummary(property, comp, adjustedPrice - comp.price, similarityScore - 100)
    };
  });
  
  // Helper function to generate adjustment summary
  function generateAdjustmentSummary(target, comp, totalPriceAdj, totalSimAdj) {
    const items = [];
    
    // Simply list what this comparable HAS or DOESN'T HAVE
    // No arrows, no "target vs comp", just simple facts
    
    // Bedrooms (now can differ by ±1)
    if (target.bedrooms !== comp.bedrooms) {
      const diff = comp.bedrooms - target.bedrooms;
      if (diff > 0) {
        items.push(`+${diff} bed (-8%)`);
      } else {
        items.push(`${diff} bed (+8%)`);
      }
    }
    
    // Bathrooms
    if (target.bathrooms !== comp.bathrooms) {
      const diff = comp.bathrooms - target.bathrooms;
      if (diff > 0) {
        items.push(`+${diff} bath`);
      } else {
        items.push(`${diff} bath`);
      }
    }
    
    // Land size
    if (target.landSize && comp.landSize && Math.abs(target.landSize - comp.landSize) > 20) {
      const diff = comp.landSize - target.landSize;
      if (diff > 0) {
        items.push(`+${diff}m²`);
      } else {
        items.push(`${diff}m²`);
      }
    }
    
    // Building age
    if (target.buildingAge !== null && comp.buildingAge !== null && Math.abs(target.buildingAge - comp.buildingAge) > 3) {
      const diff = comp.buildingAge - target.buildingAge;
      if (diff > 0) {
        items.push(`${Math.abs(diff)}y older`);
      } else {
        items.push(`${Math.abs(diff)}y newer`);
      }
    }
    
    // Stories
    if (target.stories && comp.stories && target.stories !== comp.stories) {
      if (comp.stories > target.stories) {
        items.push('2-story');
      } else {
        items.push('Single story');
      }
    }
    
    // Pool
    if (target.hasPool !== comp.hasPool) {
      if (comp.hasPool) {
        items.push('Has pool (-$55k)');
      } else {
        items.push('No pool (+$55k)');
      }
    }
    
    // Renovation
    if (target.hasRenovation !== comp.hasRenovation) {
      if (comp.hasRenovation) {
        items.push('Renovated (-7%)');
      } else {
        items.push('Not renovated (+7%)');
      }
    }
    
    // Water view
    if (target.hasWaterView !== comp.hasWaterView) {
      if (comp.hasWaterView) {
        items.push('Water view (-12%)');
      } else {
        items.push('No water view (+12%)');
      }
    }
    
    // City view
    if (target.hasCityView !== comp.hasCityView) {
      if (comp.hasCityView) {
        items.push('City view (-8%)');
      }
    }
    
    // Park view
    if (target.hasParkView !== comp.hasParkView) {
      if (comp.hasParkView) {
        items.push('Park view (-5%)');
      }
    }
    
    // Granny flat
    if (target.hasGrannyFlat !== comp.hasGrannyFlat) {
      if (comp.hasGrannyFlat) {
        items.push('Granny flat (-$100k)');
      } else {
        items.push('No granny flat (+$100k)');
      }
    }
    
    // Solar
    if (target.hasSolar !== comp.hasSolar) {
      if (comp.hasSolar) {
        items.push('Solar (-$12k)');
      }
    }
    
    // Garage
    if ((target.hasGarage && !comp.hasGarage) || (!target.hasGarage && comp.hasGarage)) {
      if (comp.hasGarage) {
        items.push('Garage (-$20k)');
      } else {
        items.push('Carport');
      }
    }
    
    // Build simple string
    let text = '';
    
    // Time
    if (comp.soldDate) {
      const match = comp.soldDate.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
      if (match) {
        const [, day, month, year] = match;
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const monthIndex = months.findIndex(m => month.toLowerCase().startsWith(m));
        if (monthIndex !== -1) {
          const saleDate = new Date(parseInt(year), monthIndex, parseInt(day));
          const daysAgo = Math.floor((new Date() - saleDate) / (1000 * 60 * 60 * 24));
          const monthsAgo = Math.round(daysAgo / 30);
          
          if (monthsAgo === 0) {
            text = `${daysAgo}d ago`;
          } else {
            text = `${monthsAgo}mo ago`;
          }
          
          // Growth (handle negative growth properly)
          if (comp.marketGrowthAdjustment && Math.abs(comp.marketGrowthAdjustment) > 1000) {
            const growthAmount = Math.round(comp.marketGrowthAdjustment / 1000);
            const growthSign = growthAmount > 0 ? '+' : '';
            text += ` • ${growthSign}$${growthAmount}k growth`;
          }
        }
      }
    }
    
    // Add differences
    if (items.length > 0) {
      if (text) text += ' • ';
      text += items.join(' • ');
    }
    
    // Total
    if (text) text += ' • ';
    const adjSign = totalPriceAdj > 0 ? '+' : '';
    text += `<strong>${adjSign}$${Math.round(Math.abs(totalPriceAdj) / 1000)}k total</strong>`;
    
    return text;
  }
  
  // Filter out any comparables with invalid data
  const validComparables = adjustedComparables.filter(c => 
    !isNaN(c.adjustedPrice) && 
    !isNaN(c.similarityScore) && 
    c.adjustedPrice > 0 && 
    c.similarityScore >= 0
  );
  
  if (validComparables.length === 0) {
    throw new Error('No valid comparables after adjustments');
  }
  
  // Sort by similarity
  validComparables.sort((a, b) => b.similarityScore - a.similarityScore);
  
  // Take top 15 most similar (increased from 10 since we removed outlier filtering)
  const topComparables = validComparables.slice(0, Math.min(15, validComparables.length));
  
  console.log('Top comparables after adjustment:', topComparables);
  console.log('Comparable prices:', topComparables.map(c => `Original: $${c.price}, Adjusted: $${c.adjustedPrice}, Similarity: ${c.similarityScore}%`));
  
  // Calculate weighted median (more robust than weighted average against outliers)
  const estimatedValue = calculateWeightedMedian(topComparables);
  
  console.log('Final estimated value (weighted median):', estimatedValue);
  
  // ENHANCED CONFIDENCE SCORING
  // Multiple factors contribute to confidence level
  
  // Factor 1: Number of comparables (more = better)
  const countScore = Math.min(topComparables.length / 15, 1.0); // Max at 15 comps
  
  // Factor 2: Average similarity score (higher = better matches)
  const avgSimilarity = topComparables.reduce((sum, c) => sum + c.similarityScore, 0) / topComparables.length;
  const similarityScore = Math.min(avgSimilarity / 140, 1.0); // Max at 140 (excellent match)
  
  // Factor 3: Price consistency (lower variance = more confident)
  const prices = topComparables.map(c => c.adjustedPrice);
  const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
  const variance = prices.reduce((sum, p) => sum + Math.pow(p - avgPrice, 2), 0) / prices.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = stdDev / avgPrice; // Lower is better
  const consistencyScore = Math.max(0, 1 - (coefficientOfVariation / 0.15)); // Good if CV < 15%
  
  // Factor 4: Data completeness (how many features do we know?)
  let knownFeatures = 0;
  let totalFeatures = 0;
  
  topComparables.forEach(comp => {
    totalFeatures += 11; // stories, pool, reno, views (3), age, granny flat, solar, garage, carport
    if (comp.stories !== null) knownFeatures++;
    if (comp.hasPool !== undefined) knownFeatures++;
    if (comp.hasRenovation !== undefined) knownFeatures++;
    if (comp.hasWaterView !== undefined) knownFeatures++;
    if (comp.hasCityView !== undefined) knownFeatures++;
    if (comp.hasParkView !== undefined) knownFeatures++;
    if (comp.buildingAge !== null) knownFeatures++;
    if (comp.hasGrannyFlat !== undefined) knownFeatures++;
    if (comp.hasSolar !== undefined) knownFeatures++;
    if (comp.hasGarage !== undefined) knownFeatures++;
    if (comp.hasCarport !== undefined) knownFeatures++;
  });
  
  const dataQualityScore = knownFeatures / totalFeatures;
  
  // Factor 5: Recency (more recent sales = more confident)
  const avgDaysAgo = topComparables.reduce((sum, c) => {
    if (!c.soldDate) return sum;
    const match = c.soldDate.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
    if (!match) return sum;
    const [, day, month, year] = match;
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthIndex = months.findIndex(m => month.toLowerCase().startsWith(m));
    if (monthIndex === -1) return sum;
    const saleDate = new Date(parseInt(year), monthIndex, parseInt(day));
    const daysAgo = (new Date() - saleDate) / (1000 * 60 * 60 * 24);
    return sum + daysAgo;
  }, 0) / topComparables.length;
  
  const recencyScore = Math.max(0, 1 - (avgDaysAgo / 180)); // Perfect if < 30 days, poor if > 180 days
  
  // Combined confidence score (weighted average)
  const confidenceScore = (
    countScore * 0.25 +           // 25% - number of comparables
    similarityScore * 0.30 +      // 30% - match quality
    consistencyScore * 0.25 +     // 25% - price consistency
    dataQualityScore * 0.10 +     // 10% - data completeness
    recencyScore * 0.10           // 10% - recency
  );
  
  // Determine confidence level and range
  let confidenceLevel, confidencePercent;
  if (confidenceScore >= 0.80) {
    confidenceLevel = 'Very High';
    confidencePercent = 4; // ±4%
  } else if (confidenceScore >= 0.65) {
    confidenceLevel = 'High';
    confidencePercent = 6; // ±6%
  } else if (confidenceScore >= 0.50) {
    confidenceLevel = 'Medium';
    confidencePercent = 8; // ±8%
  } else if (confidenceScore >= 0.35) {
    confidenceLevel = 'Low';
    confidencePercent = 12; // ±12%
  } else {
    confidenceLevel = 'Very Low';
    confidencePercent = 15; // ±15%
  }
  
  const confidenceRange = Math.round(estimatedValue * (confidencePercent / 100));
  
  console.log(`Confidence Analysis:`);
  console.log(`  - Count: ${topComparables.length} comps (${(countScore * 100).toFixed(0)}%)`);
  console.log(`  - Similarity: avg ${avgSimilarity.toFixed(0)} (${(similarityScore * 100).toFixed(0)}%)`);
  console.log(`  - Consistency: CV ${(coefficientOfVariation * 100).toFixed(1)}% (${(consistencyScore * 100).toFixed(0)}%)`);
  console.log(`  - Data Quality: ${(dataQualityScore * 100).toFixed(0)}% features known`);
  console.log(`  - Recency: avg ${avgDaysAgo.toFixed(0)} days ago (${(recencyScore * 100).toFixed(0)}%)`);
  console.log(`  → Overall: ${(confidenceScore * 100).toFixed(0)}% = ${confidenceLevel} (±${confidencePercent}%)`);
  
  return {
    estimate: estimatedValue,
    low: estimatedValue - confidenceRange,
    high: estimatedValue + confidenceRange,
    comparables: topComparables,
    confidence: confidenceLevel,
    confidenceScore: confidenceScore,
    confidenceMetrics: {
      comparableCount: topComparables.length,
      avgSimilarity: avgSimilarity,
      priceVariance: coefficientOfVariation,
      dataQuality: dataQualityScore,
      avgDaysOld: avgDaysAgo
    }
  };
}

function createWidget() {
  const widget = document.createElement('div');
  widget.id = 'property-valuation-widget';
  widget.innerHTML = `
    <div class="valuation-container">
      <div class="valuation-header">
        <span class="valuation-title">AI Valuation Estimate</span>
        <span class="valuation-badge">Loading...</span>
      </div>
      <div class="valuation-content">
        <div class="spinner"></div>
      </div>
    </div>
  `;
  return widget;
}

function updateWidget(data) {
  const widget = document.getElementById('property-valuation-widget');
  if (!widget) return;
  
  const header = widget.querySelector('.valuation-header');
  const content = widget.querySelector('.valuation-content');
  
  // Safety check for undefined data
  if (!data) {
    header.querySelector('.valuation-badge').textContent = 'Error';
    header.querySelector('.valuation-badge').style.background = '#dc2626';
    content.innerHTML = `<p class="error-message">Unknown error occurred</p>`;
    return;
  }
  
  if (data.error) {
    header.querySelector('.valuation-badge').textContent = 'Error';
    header.querySelector('.valuation-badge').style.background = '#dc2626';
    content.innerHTML = `<p class="error-message">${data.error}</p>`;
    return;
  }
  
  header.querySelector('.valuation-badge').textContent = `${data.confidence} Confidence`;
  header.querySelector('.valuation-badge').style.background = 
    data.confidence === 'High' ? '#059669' : 
    data.confidence === 'Medium' ? '#d97706' : '#dc2626';
  
  const formatter = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  
  content.innerHTML = `
    <div class="valuation-estimate">
      <div class="estimate-value">${formatter.format(data.estimate)}</div>
      <div class="estimate-range">Range: ${formatter.format(data.low)} - ${formatter.format(data.high)}</div>
      ${data.warning ? `<div class="estimate-warning" style="color: rgba(255,255,255,0.85); font-size: 12px; margin-top: 8px;">⚠️ ${data.warning}</div>` : ''}
    </div>
    <button class="view-comparables-btn">View ${data.comparables.length} Comparable Sales</button>
  `;
  
  // Add click handler for comparables
  const btn = content.querySelector('.view-comparables-btn');
  btn.addEventListener('click', () => showComparables(data.comparables));
}

function showComparables(comparables) {
  const formatter = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  
  const modal = document.createElement('div');
  modal.className = 'comparables-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>Comparable Sales</h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        ${comparables.map(comp => `
          <div class="comparable-card">
            <div class="comparable-address">${comp.address}</div>
            <div class="comparable-details">
              <span>${comp.bedrooms} bed</span>
              <span>${comp.bathrooms} bath</span>
              ${comp.parking ? `<span>${comp.parking} car</span>` : ''}
              ${comp.landSize ? `<span>${comp.landSize}m²</span>` : ''}
            </div>
            <div class="comparable-price">${formatter.format(comp.price)}</div>
            ${comp.soldDate ? `<div class="comparable-date">Sold on ${comp.soldDate}</div>` : ''}
            ${comp.adjustmentSummary ? `
              <div class="adjustment-summary" style="
                font-size: 11px;
                color: #1f2937;
                margin: 8px 0;
                padding: 6px 8px;
                background: #f3f4f6;
                border-radius: 4px;
                line-height: 1.4;
                border-left: 3px solid #3b82f6;
              ">
                ${comp.adjustmentSummary}
              </div>
            ` : ''}
            <div class="comparable-adjusted">
              Adjusted: ${formatter.format(comp.adjustedPrice)}
              <span class="similarity-score">${
                comp.similarityScore >= 145 ? 'Perfect Match' : 
                Math.round(comp.similarityScore) + '% match'
              }</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close modal handlers
  const closeBtn = modal.querySelector('.modal-close');
  closeBtn.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}











