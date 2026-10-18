// Glosario en lenguaje simple (definiciones de NWS/USGS reescritas para no técnicos).
export const GLOSSARY: { term: string; id: string; text: string }[] = [
  { id: 'stage', term: 'River stage (ft)', text: 'How high the water is at the gauge, in feet above a local reference point. It is not the water depth: 0 ft does not mean a dry river.' },
  { id: 'action', term: 'Action stage', text: 'The river is getting high. Nothing floods yet, but officials start watching closely and preparing.' },
  { id: 'minor', term: 'Flood stage / minor flooding', text: 'Water starts leaving the riverbanks: low roads, parks and fields near the river can flood. Little or no damage to buildings.' },
  { id: 'moderate', term: 'Moderate flooding', text: 'Some homes and roads near the river flood. Some people may need to move to higher ground.' },
  { id: 'major', term: 'Major flooding', text: 'Widespread flooding of buildings and roads. Evacuations are likely. This is a dangerous flood.' },
  { id: 'crest', term: 'Crest', text: 'The highest point the river reaches during a flood, before it starts going down.' },
  { id: 'cfs', term: 'Flow (cfs)', text: 'How much water passes the gauge every second, in cubic feet. 1 cfs is about 7.5 gallons per second.' },
  { id: 'normal', term: 'Normal for this date', text: 'Today\u2019s flow compared with the same calendar day in past years. "Normal" means the middle half of years. It is about the season, not about flooding.' },
  { id: 'warning', term: 'Flood Warning', text: 'Flooding is happening or about to happen. Act now: move to higher ground and avoid flooded roads.' },
  { id: 'watch', term: 'Flood Watch', text: 'Flooding is possible. Be ready to act if a warning is issued.' },
  { id: 'advisory', term: 'Flood Advisory', text: 'Minor flooding or high water is expected. Be careful, especially near creeks and low roads.' },
  { id: 'forecast', term: 'NWS river forecast', text: 'The National Weather Service\u2019s prediction of the river level for the next days. It includes expected rain and changes as the weather changes.' },
];
