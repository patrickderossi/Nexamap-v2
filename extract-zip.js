const fs = require('fs');
const path = require('path');

// Try to read the zip file and extract JSON content
try {
  const zipBuffer = fs.readFileSync('public/custom-geojson.zip');
  
  // Look for the JSON file signature in the zip
  const zipString = zipBuffer.toString('binary');
  
  // Find the start of the JSON content (look for {"type":"FeatureCollection")
  const jsonStart = zipString.indexOf('{"type":"FeatureCollection');
  
  if (jsonStart !== -1) {
    // Extract from the JSON start to the end of the buffer
    let jsonContent = zipString.substring(jsonStart);
    
    // Find the end of the JSON (look for the last closing brace)
    let braceCount = 0;
    let jsonEnd = -1;
    
    for (let i = 0; i < jsonContent.length; i++) {
      if (jsonContent[i] === '{') braceCount++;
      else if (jsonContent[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          jsonEnd = i + 1;
          break;
        }
      }
    }
    
    if (jsonEnd !== -1) {
      jsonContent = jsonContent.substring(0, jsonEnd);
      
      // Validate JSON
      try {
        const parsed = JSON.parse(jsonContent);
        console.log('✅ Successfully extracted GeoJSON');
        console.log('Features count:', parsed.features ? parsed.features.length : 0);
        
        // Write the extracted JSON to a new file
        fs.writeFileSync('public/electrical-pillars.json', jsonContent);
        console.log('✅ Saved to public/electrical-pillars.json');
        
        
      } catch (parseError) {
        console.error('❌ JSON parse error:', parseError.message);
      }
    } else {
      console.error('❌ Could not find end of JSON content');
    }
  } else {
    console.error('❌ Could not find JSON content in zip file');
  }
  
} catch (error) {
  console.error('❌ Error reading zip file:', error.message);
}
