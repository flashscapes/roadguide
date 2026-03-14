/* RoadGuide — Film & TV Locations
   All images use Wikipedia Commons or other reliable public-domain sources.
   Each entry: name, media, scene, fun_fact, coords, image, county
*/

const landmarks_bayarea_film = [

  // ── SAN FRANCISCO ──────────────────────────────────────

  { name: "Mrs. Doubtfire House", county: "San Francisco", media: "Mrs. Doubtfire (1993)",
    scene: "The iconic Victorian at 2640 Steiner St where Daniel Hillard disguised himself as a British nanny to be near his children — the exterior was used for every 'home' scene in the film.",
    fun_fact: "The real address matches the movie address exactly. Fans still leave flowers and notes on the front steps.",
    coords: { lat: 37.7939, lng: -122.4364 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Mrs._Doubtfire_house_San_Francisco.jpg/640px-Mrs._Doubtfire_house_San_Francisco.jpg" },

  { name: "The Painted Ladies", county: "San Francisco", media: "Full House (1987–1995)",
    scene: "These seven Victorian houses on Alamo Square appeared in the opening credits of Full House, with the Tanner family having a picnic in the park as the skyline glittered behind them.",
    fun_fact: "The actual Tanner family house used for exterior shots is 1709 Broderick St — four blocks away from the Painted Ladies.",
    coords: { lat: 37.7763, lng: -122.4328 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Painted_Ladies_San_Francisco_with_skyline.jpg/640px-Painted_Ladies_San_Francisco_with_skyline.jpg" },

  { name: "Palace of Fine Arts", county: "San Francisco", media: "The Rock (1996) / Vertigo (1958)",
    scene: "In The Rock, Nicolas Cage and Sean Connery meet here in a tense handoff scene. Hitchcock also filmed key scenes from Vertigo in and around this rotunda.",
    fun_fact: "The Palace was built as a temporary structure for the 1915 World's Fair out of plaster and burlap — San Franciscans loved it so much they refused to tear it down.",
    coords: { lat: 37.8029, lng: -122.4484 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Palace_of_Fine_Arts_San_Francisco.jpg/640px-Palace_of_Fine_Arts_San_Francisco.jpg" },

  { name: "Lombard Street", county: "San Francisco", media: "Ant-Man (2015) / Bullitt (1968)",
    scene: "The 'Crookedest Street in the World' has anchored SF car chase sequences for decades. Ant-Man used it for a shrunken-down chase sequence; Bullitt's iconic chase wound through the surrounding streets.",
    fun_fact: "The speed limit is only 5 mph — making filmed chases here look far more dramatic than they actually were to shoot.",
    coords: { lat: 37.8021, lng: -122.4187 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Lombard_street_in_SF_4.jpg/640px-Lombard_street_in_SF_4.jpg" },

  { name: "Alcatraz Island", county: "San Francisco", media: "Escape from Alcatraz (1979) / The Rock (1996)",
    scene: "Clint Eastwood's real-feeling 1979 escape thriller was partially filmed on the actual island. The Rock used Alcatraz as its primary setting for the hostage crisis storyline.",
    fun_fact: "Filming The Rock required the cast and crew to spend nights on the island — several crew members reported hearing unexplained sounds in the cellblock after dark.",
    coords: { lat: 37.8270, lng: -122.4230 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Alcatraz_Island_as_seen_from_above.jpg/640px-Alcatraz_Island_as_seen_from_above.jpg" },

  { name: "Fort Point", county: "San Francisco", media: "Vertigo (1958) / Dawn of the Planet of the Apes (2014)",
    scene: "One of Hitchcock's most famous images: Scottie Ferguson pulls Madeleine from the bay directly below the Golden Gate Bridge at Fort Point. Dawn of the Apes used it as a key ape territory boundary.",
    fun_fact: "When the Golden Gate Bridge was designed, engineers wanted to demolish Fort Point. Joseph Strauss instead built a special arch over it — which is why you can stand inside the fort and look straight up at the bridge.",
    coords: { lat: 37.8105, lng: -122.4769 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Fort_Point_from_Golden_Gate_Bridge.jpg/640px-Fort_Point_from_Golden_Gate_Bridge.jpg" },

  { name: "Chinatown Gate", county: "San Francisco", media: "Big Trouble in Little China (1986)",
    scene: "Jack Burton drives his big rig through this gate at the start of his adventure into the supernatural underworld of San Francisco's Chinatown in John Carpenter's cult classic.",
    fun_fact: "This Dragon Gate at the entrance to Grant Avenue is the only authentic Chinatown ceremonial gate in the US with stone guardian lions flanking both sides.",
    coords: { lat: 37.7907, lng: -122.4056 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Dragon_Gate_San_Francisco.jpg/640px-Dragon_Gate_San_Francisco.jpg" },

  { name: "Coit Tower", county: "San Francisco", media: "The Enforcer (1976) / San Andreas (2015)",
    scene: "Coit Tower served as a dramatic backdrop for multiple Dirty Harry films. In San Andreas, Dwayne Johnson's helicopter rescue sequence sweeps past it as the city crumbles around him.",
    fun_fact: "The tower's Depression-era murals caused a near-scandal in 1934 — city officials tried to paint over the communist imagery before a public outcry stopped them.",
    coords: { lat: 37.8024, lng: -122.4058 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Coit_Tower%2C_SF.jpg/640px-Coit_Tower%2C_SF.jpg" },

  { name: "San Francisco City Hall", county: "San Francisco", media: "Raiders of the Lost Ark (1981) / Milk (2008)",
    scene: "The grand Beaux-Arts rotunda doubled as the U.S. Capitol interior for Raiders of the Lost Ark. Gus Van Sant filmed Harvey Milk's political scenes here for the 2008 biopic.",
    fun_fact: "The dome is the fifth largest in the world — three feet taller than the U.S. Capitol dome in Washington D.C.",
    coords: { lat: 37.7793, lng: -122.4193 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/San_Francisco_City_Hall_at_night.jpg/640px-San_Francisco_City_Hall_at_night.jpg" },

  { name: "555 California Street", county: "San Francisco", media: "The Towering Inferno (1974)",
    scene: "This skyscraper represented the fictional 'Glass Tower' in the disaster epic, standing in for a 138-story building engulfed in flames with Steve McQueen and Paul Newman racing to save survivors.",
    fun_fact: "It was the tallest building in San Francisco for nearly 50 years. The real building never had a fire — but the film so terrified the public that it changed high-rise fire safety codes nationwide.",
    coords: { lat: 37.7922, lng: -122.4038 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/555_California_Street_2.jpg/640px-555_California_Street_2.jpg" },

  { name: "The Fairmont Hotel", county: "San Francisco", media: "The Rock (1996) / Shang-Chi (2021)",
    scene: "The Rock's villain Ed Harris holds his hostage crisis briefing in the Fairmont's ornate ballroom. Marvel's Shang-Chi filmed its opening San Francisco action sequences around the Nob Hill neighborhood.",
    fun_fact: "The Fairmont is where the original United Nations Charter was drafted in 1945 — world leaders negotiated in the very ballroom used in The Rock.",
    coords: { lat: 37.7925, lng: -122.4103 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Fairmont_Hotel_SF.jpg/640px-Fairmont_Hotel_SF.jpg" },

  { name: "Mission Dolores Park", county: "San Francisco", media: "Milk (2008)",
    scene: "Harvey Milk held his famous political rallies and community gatherings at Dolores Park, which became the symbolic heart of the Castro neighborhood's fight for equality in the film.",
    fun_fact: "The park offers what cinematographers call the 'truest' wide view of the SF skyline — it has appeared as a background establishing shot in dozens of films and TV shows.",
    coords: { lat: 37.7596, lng: -122.4269 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Mission_Dolores_Basilica.jpg/640px-Mission_Dolores_Basilica.jpg" },

  { name: "Grace Cathedral", county: "San Francisco", media: "Bullitt (1968)",
    scene: "The Gothic towers of Grace Cathedral on Nob Hill appear in several atmospheric driving and chase sequences in Bullitt — director Peter Yates specifically wanted the imposing stonework as a contrast to the raw action.",
    fun_fact: "Grace Cathedral contains two labyrinths for walking meditation — one inside and one outside. The outdoor one is made from stone salvaged from a demolished Nob Hill mansion.",
    coords: { lat: 37.7919, lng: -122.4128 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Grace_Cathedral_San_Francisco.jpg/640px-Grace_Cathedral_San_Francisco.jpg" },

  { name: "Ferry Building", county: "San Francisco", media: "Hulk (2003)",
    scene: "In Ang Lee's visually experimental Hulk, Bruce Banner's green alter ego tears through the Embarcadero and battles military helicopters directly in front of the Ferry Building's clock tower.",
    fun_fact: "The Ferry Building's clock kept running through the catastrophic 1906 earthquake — it became a symbol of San Francisco's resilience and was featured on early postcards of the rebuilt city.",
    coords: { lat: 37.7955, lng: -122.3937 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/San_Francisco_Ferry_Building.jpg/640px-San_Francisco_Ferry_Building.jpg" },

  { name: "Kezar Stadium", county: "San Francisco", media: "Dirty Harry (1971)",
    scene: "The stadium's empty field at night is where the Scorpio killer forces Harry Callahan on a humiliating chase — culminating in the famous 'Do you feel lucky, punk?' confrontation nearby.",
    fun_fact: "Kezar was the original home of the San Francisco 49ers from 1946 to 1970. The team played their first Super Bowl-winning seasons after moving to Candlestick Park.",
    coords: { lat: 37.7670, lng: -122.4556 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Kezar_Stadium_Aerial.jpg/640px-Kezar_Stadium_Aerial.jpg" },

  { name: "Musée Mécanique", county: "San Francisco", media: "The Princess Diaries (2001)",
    scene: "The antique penny arcade at Fisherman's Wharf is where Princess Mia has her first unguarded, joyful moments in San Francisco before discovering her royal lineage changes everything.",
    fun_fact: "Many of the 300+ mechanical arcade machines here are over 100 years old and still operate on quarters. The collection is one of the largest privately owned antique arcade collections in the world.",
    coords: { lat: 37.8095, lng: -122.4163 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Mus%C3%A9e_M%C3%A9canique_San_Francisco.jpg/640px-Mus%C3%A9e_M%C3%A9canique_San_Francisco.jpg" },

  { name: "Castro Theatre", county: "San Francisco", media: "Milk (2008)",
    scene: "The historic Castro Theatre was Harvey Milk's neighborhood cinema and community anchor. Gus Van Sant filmed several key scenes here, capturing the theater as the cultural heart of the gay rights movement.",
    fun_fact: "The Castro Theatre has a custom-built pipe organ that rises dramatically from below the stage before screenings — a tradition that continues to this day.",
    coords: { lat: 37.7620, lng: -122.4347 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/Castro_Theatre_San_Francisco.jpg/640px-Castro_Theatre_San_Francisco.jpg" },

  { name: "Lafayette Park", county: "San Francisco", media: "The Wedding Planner (2001)",
    scene: "This hilltop park in Pacific Heights is where Jennifer Lopez's wedding planner character and Matthew McConaughey's doctor meet by chance — the meet-cute scene that sets the entire film in motion.",
    fun_fact: "Lafayette Park sits on one of the highest points in Pacific Heights, offering unobstructed views of the bay. It was the site of a legal battle for nearly 40 years after a squatter built a mansion in the middle of it.",
    coords: { lat: 37.7914, lng: -122.4277 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Lafayette_Park_SF_lawn.jpg/640px-Lafayette_Park_SF_lawn.jpg" },

  { name: "Pier 7", county: "San Francisco", media: "Ant-Man and the Wasp (2018)",
    scene: "The longest wooden pier on the San Francisco waterfront was used for chase and shrinking sequences in Ant-Man and the Wasp — the pier's straight lines made it ideal for the visual effects team.",
    fun_fact: "Pier 7 is perfectly aligned with the Transamerica Pyramid when viewed from the Embarcadero — a sight line that appears in countless films and photographs of the city.",
    coords: { lat: 37.7994, lng: -122.3970 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Embarcadero_San_Francisco.jpg/640px-Embarcadero_San_Francisco.jpg" },

  { name: "St. Peter and Paul Church", county: "San Francisco", media: "Sister Act (1992)",
    scene: "The North Beach church's soaring twin spires provided the setting for Whoopi Goldberg's choir scenes as Sister Mary Clarence transforms the parish choir into a gospel sensation.",
    fun_fact: "Marilyn Monroe and Joe DiMaggio took their wedding photographs on the steps of this church in 1954 — though they were actually married at City Hall, the church wouldn't perform the ceremony.",
    coords: { lat: 37.8016, lng: -122.4102 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Saints_Peter_and_Paul_Church_San_Francisco.jpg/640px-Saints_Peter_and_Paul_Church_San_Francisco.jpg" },

  { name: "Twin Peaks", county: "San Francisco", media: "Memoirs of an Invisible Man (1992)",
    scene: "The Twin Peaks summit is the go-to location for sweeping city-overview shots. Chevy Chase's invisible protagonist uses the hilltop's sightlines to orient himself while evading government agents.",
    fun_fact: "Spanish explorers named these hills 'Los Pechos de la Chola' — The Breasts of the Indian Maiden. The name was quietly changed to Twin Peaks during the American period.",
    coords: { lat: 37.7544, lng: -122.4477 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/San_Francisco_from_Twin_Peaks.jpg/640px-San_Francisco_from_Twin_Peaks.jpg" },

  { name: "Cable Car Turnaround", county: "San Francisco", media: "The Princess Diaries (2001) / Venom (2018)",
    scene: "The Powell Street cable car turnaround at Market Street is one of the most filmed transit locations in the world. Princess Mia rides the cable car in her transformation montage; Venom's chase sequences use the surrounding streets.",
    fun_fact: "These are the last manually operated cable cars in existence anywhere in the world. The turntable is hand-operated by crew members and tourists are invited to help push the car around.",
    coords: { lat: 37.7845, lng: -122.4080 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/San_Francisco_Cable_Car_at_Powell_and_Market.jpg/640px-San_Francisco_Cable_Car_at_Powell_and_Market.jpg" },

  // ── CONTRA COSTA ───────────────────────────────────────

  { name: "Bridges Restaurant", county: "Contra Costa", media: "Mrs. Doubtfire (1993)",
    scene: "This is the site of the film's most memorable and chaotic sequence — the climactic dinner where Robin Williams must simultaneously serve as the hired waiter Mrs. Doubtfire for one table and be himself as Daniel Hillard for his family at another, racing back and forth to the bathroom to switch disguises.",
    fun_fact: "The restaurant is still open today and looks remarkably similar to how it did in 1993. Staff will point out the exact tables used in the scene.",
    coords: { lat: 37.8228, lng: -122.0004 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Bridges_restaurant_Danville_California.jpg/640px-Bridges_restaurant_Danville_California.jpg" },

  { name: "Orinda Theatre", county: "Contra Costa", media: "13 Reasons Why (2017)",
    scene: "The Orinda Theatre's stunning 1941 Art Deco exterior and neon tower appear as a backdrop in Netflix's 13 Reasons Why, standing in for the kind of small-town movie house central to the show's Northern California setting.",
    fun_fact: "The Orinda Theatre's neon tower was declared a historic landmark after a community campaign in the 1990s saved it from being torn down when the theater nearly closed.",
    coords: { lat: 37.8824, lng: -122.1831 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Orinda_Theatre.jpg/640px-Orinda_Theatre.jpg" },

  { name: "Mount Diablo Summit", county: "Contra Costa", media: "Various Aerial Productions",
    scene: "Mount Diablo's summit has served as an aerial filming location for countless productions needing sweeping Northern California landscape shots — from nature documentaries to action films requiring a dramatic backdrop.",
    fun_fact: "On a clear winter day you can see 35 of California's 58 counties from this summit — one of the widest unobstructed views achievable from any single point in North America.",
    coords: { lat: 37.8816, lng: -121.9142 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Mount_Diablo_from_summit.jpg/640px-Mount_Diablo_from_summit.jpg" },

  // ── ALAMEDA ────────────────────────────────────────────

  { name: "Alameda Naval Air Station", county: "Alameda", media: "The Matrix Reloaded (2003)",
    scene: "The Wachowskis filmed the legendary 14-minute freeway chase sequence on a 1.5-mile stretch of fake highway built on the decommissioned Alameda Naval Air Station runways — one of the most expensive single action sequences ever filmed.",
    fun_fact: "The crew spent 6 months and $40 million building the fake highway on the base. The sequence required 300 stunt performers and took 3 months to film.",
    coords: { lat: 37.7554, lng: -122.2285 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/USS_Potomac_Oakland.jpg/640px-USS_Potomac_Oakland.jpg" },

  { name: "Jack London Square", county: "Alameda", media: "Various 1970s Thrillers",
    scene: "The gritty Oakland waterfront of Jack London Square provided the backdrop for numerous 1970s crime and grit thrillers that used its industrial docks and warehouses to represent a raw, unpolished urban California.",
    fun_fact: "Jack London himself grew up near this waterfront and worked as an oyster pirate in the bay as a teenager — stealing from privately owned beds and selling to saloons before becoming one of America's most famous writers.",
    coords: { lat: 37.7944, lng: -122.2764 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Jack_London_Square_Oakland.jpg/640px-Jack_London_Square_Oakland.jpg" },

  { name: "UC Berkeley — Sather Gate", county: "Alameda", media: "Oppenheimer (2023) / The Graduate (1967)",
    scene: "Sather Gate is the iconic campus entrance seen in Oppenheimer's Berkeley scenes as a young J. Robert Oppenheimer arrives to change the world. Dustin Hoffman's Benjamin Braddock also walks through this gate in The Graduate.",
    fun_fact: "Sather Gate was the main entrance to UC Berkeley until the 1920s, when the campus expanded. The free speech movement protests of the 1960s centered on the plaza just outside this gate.",
    coords: { lat: 37.8721, lng: -122.2590 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Sather_Gate_UC_Berkeley.jpg/640px-Sather_Gate_UC_Berkeley.jpg" },

  { name: "Grand Lake Theatre", county: "Alameda", media: "Sorry to Bother You (2018)",
    scene: "The Grand Lake Theatre's ornate facade and marquee appear in Boots Riley's surrealist Oakland satire Sorry to Bother You, grounding the film's heightened reality in a recognizable East Bay landmark.",
    fun_fact: "The Grand Lake Theatre is famous for using its marquee to post political messages to the city — a tradition that has made it as famous for its commentary as for its films.",
    coords: { lat: 37.8115, lng: -122.2475 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Grand_Lake_Theatre_Oakland.jpg/640px-Grand_Lake_Theatre_Oakland.jpg" },

  // ── MARIN ──────────────────────────────────────────────

  { name: "Marin Civic Center", county: "Marin", media: "Gattaca (1997) / THX 1138 (1971)",
    scene: "Frank Lloyd Wright's masterpiece served as the futuristic society headquarters in Gattaca — its sweeping arches and blue spire needed almost no modification to read as a utopian sci-fi world. George Lucas also filmed parts of THX 1138 here.",
    fun_fact: "George Lucas was so inspired by this building that he used it as his primary design reference for the city of Naboo in the Star Wars prequel trilogy.",
    coords: { lat: 37.9984, lng: -122.5312 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Marin_County_Civic_Center_Aerial.jpg/640px-Marin_County_Civic_Center_Aerial.jpg" },

  { name: "Muir Woods", county: "Marin", media: "Rise of the Planet of the Apes (2011)",
    scene: "Caesar and the liberated apes take refuge in Muir Woods' ancient redwood groves in the film's triumphant final act — the forest's cathedral-like scale made it the perfect sanctuary for the newly intelligent primates.",
    fun_fact: "The redwoods in Muir Woods are between 500 and 1,200 years old. The tallest tree in the park is 258 feet — taller than the Statue of Liberty from base to torch.",
    coords: { lat: 37.8970, lng: -122.5811 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Muir_Woods_National_Monument.jpg/640px-Muir_Woods_National_Monument.jpg" },

  { name: "Point Reyes Lighthouse", county: "Marin", media: "The Fog (1980)",
    scene: "John Carpenter used the remote, wind-battered Point Reyes Lighthouse as the primary setting for his atmospheric horror film — the lighthouse keeper's isolation and the coastal fog made it the perfect location for the story.",
    fun_fact: "You must walk down 313 steps to reach the lighthouse from the clifftop parking area — and then climb back up. On windy days the National Park Service closes the stairs entirely.",
    coords: { lat: 38.0037, lng: -123.0233 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Point_Reyes_Lighthouse_2016.jpg/640px-Point_Reyes_Lighthouse_2016.jpg" },

  // ── SANTA CRUZ ─────────────────────────────────────────

  { name: "Santa Cruz Beach Boardwalk", county: "Santa Cruz", media: "The Lost Boys (1987) / Us (2019)",
    scene: "The Boardwalk's neon-lit carousel and beach carnival atmosphere set the entire tone of The Lost Boys — it's where the teenage vampires hunt. Jordan Peele returned to the same location for the eerie funhouse sequences in Us.",
    fun_fact: "The Giant Dipper wooden roller coaster at the Boardwalk opened in 1924 and is a National Historic Landmark. It was still operating when The Lost Boys filmed here — and still runs today.",
    coords: { lat: 36.9644, lng: -122.0189 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Santa_Cruz_Beach_Boardwalk_2012.jpg/640px-Santa_Cruz_Beach_Boardwalk_2012.jpg" },

  { name: "Brookdale Lodge", county: "Santa Cruz", media: "Various Classic Hollywood Productions",
    scene: "The legendary Brookdale Lodge, famous for having a brook running through its dining room, served as a location for numerous classic Hollywood productions and was a favorite retreat for stars seeking privacy in the Santa Cruz Mountains.",
    fun_fact: "Marilyn Monroe, Dean Martin, and President Herbert Hoover were all regular guests at Brookdale Lodge. The creek still flows through the dining room — the only restaurant in the world where a mountain stream runs beneath your table.",
    coords: { lat: 37.1066, lng: -122.1102 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Brookdale_Lodge_Dining_Room.jpg/640px-Brookdale_Lodge_Dining_Room.jpg" },

  // ── SONOMA ─────────────────────────────────────────────

  { name: "Potter Schoolhouse", county: "Sonoma", media: "The Birds (1963)",
    scene: "Alfred Hitchcock chose this 1873 schoolhouse in the tiny town of Bodega as the setting for the harrowing scene where children flee across an open field as seagulls attack — one of the most iconic images in horror film history.",
    fun_fact: "Hitchcock found the schoolhouse being used as a private residence and paid the owners to vacate temporarily. His crew artificially 'aged' the building to look more weathered and rural.",
    coords: { lat: 38.3452, lng: -122.9739 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Potter_Schoolhouse_Bodega.jpg/640px-Potter_Schoolhouse_Bodega.jpg" },

  { name: "Goat Rock Beach", county: "Sonoma", media: "The Goonies (1985)",
    scene: "The dramatic final scene of The Goonies — where the pirate ship One-Eyed Willy's vessel sails out to sea as the kids watch from the beach — was filmed here at Goat Rock, doubling for the Oregon coast.",
    fun_fact: "The production chose Goat Rock specifically for its enormous sea stacks and dramatic rock formations, which gave the Oregon coastal feel without actually filming in Oregon.",
    coords: { lat: 38.4461, lng: -123.1257 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Goat_Rock_Beach_Sonoma_County.jpg/640px-Goat_Rock_Beach_Sonoma_County.jpg" },

  // ── NAPA ───────────────────────────────────────────────

  { name: "Chateau Montelena", county: "Napa", media: "Bottle Shock (2008)",
    scene: "This real winery was the star of Bottle Shock, the film about the 1976 Paris Wine Tasting where California wines beat the French. The château's dramatic stone castle exterior and vineyards were used throughout.",
    fun_fact: "The real 1976 Paris Tasting that inspired the film — known as the Judgment of Paris — genuinely shocked the wine world when a Chateau Montelena Chardonnay beat France's finest. The results were initially suppressed by French judges who refused to believe them.",
    coords: { lat: 38.5806, lng: -122.6015 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Chateau_Montelena.jpg/640px-Chateau_Montelena.jpg" },

  { name: "Artesa Winery", county: "Napa", media: "Wine Country (2019)",
    scene: "Amy Poehler's Netflix comedy about a group of friends on a Napa Valley girls' trip used Artesa's dramatic hillside architecture and vineyard terraces for several key scenes.",
    fun_fact: "Artesa Winery is built entirely into a hillside for natural temperature control — from the road, you can only see the roof. The building is essentially invisible until you're standing right in front of it.",
    coords: { lat: 38.2755, lng: -122.3418 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Artesa_Winery_Vineyard.jpg/640px-Artesa_Winery_Vineyard.jpg" },

  // ── SAN LUIS OBISPO ────────────────────────────────────

  { name: "Hearst Castle", county: "San Luis Obispo", media: "Spartacus (1960) / Lady Gaga: G.U.Y. (2014)",
    scene: "William Randolph Hearst's legendary estate has hosted film productions for a century. The Neptune Pool and Roman-style architecture appeared in Spartacus, and Lady Gaga used the castle and grounds as the primary location for her elaborate G.U.Y. music video.",
    fun_fact: "The Neptune Pool's Roman temple facade contains genuine ancient Roman columns shipped from Europe by Hearst. The Roman Pool beneath the castle is lined entirely with real 22-karat gold Venetian glass tiles.",
    coords: { lat: 35.6852, lng: -121.1666 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Hearst_Castle_September_2013.jpg/640px-Hearst_Castle_September_2013.jpg" },

  { name: "Morro Rock", county: "San Luis Obispo", media: "The Lady from Shanghai (1947)",
    scene: "Orson Welles filmed scenes with Rita Hayworth around the dramatic volcanic plug of Morro Rock for his noir thriller — the rock's imposing silhouette against the Pacific provided an unforgettable backdrop.",
    fun_fact: "Morro Rock is one of nine volcanic peaks called the Nine Sisters that stretch from San Luis Obispo to Morro Bay — all formed by the same volcanic event 23 million years ago. It is a protected Peregrine Falcon nesting site.",
    coords: { lat: 35.3711, lng: -120.8669 },
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Morro_Rock_2012.jpg/640px-Morro_Rock_2012.jpg" }

];
