/**
 * @file offlineDatasets.js
 * @description Windows'ta index.html dogrudan (file://) cift tiklanarak acildiginda CORS engelini
 * asmak uzere data/datasets/ altindaki NASA ve USGS JSON veri setlerinin cevrimdisi kopyasini saglar.
 */

(function (ns) {
  "use strict";
  ns.OFFLINE_DATASETS = {
    "./data/datasets/jpl_mars_trek_layers.json": {
      "_metadata": {
        "source": "NASA Jet Propulsion Laboratory (JPL) Mars Trek GIS Web Services & AstroChief Yerel Karo Arşivi",
        "url": "https://trek.nasa.gov/mars/",
        "service_type": "Yerel Karo Piramidi (data/tiles/) + WMTS EPSG:104905",
        "projection": "EPSG:104905 (Equirectangular Plate Carree -180..180, -90..90)",
        "matrix_rule": "cols = 2^(z+1), rows = 2^z, tileSize = 256px",
        "last_updated": "2026-11-14"
      },
      "tile_layers": [
        {
          "id": "mars-viking-mdim21",
          "name": "Viking MDIM 2.1 Optik",
          "type": "Optical Visible Color",
          "resolution": "231 m/px",
          "coverage": "Global (%100)",
          "format": "jpg",
          "tile_size": 256,
          "max_local_zoom": 2,
          "max_remote_zoom": 7,
          "local_template": "./data/tiles/mars-viking-mdim21/{z}/{y}/{x}.jpg",
          "wmts_template": "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg",
          "description": "Viking Orbiter görüntülerinden üretilen gerçek renkli küresel Mars yüzey mozaiği."
        },
        {
          "id": "mars-mola-elevation",
          "name": "MOLA Renkli Topografya",
          "type": "Digital Elevation Model (DEM)",
          "resolution": "463 m/px",
          "coverage": "Global (%100)",
          "format": "jpg",
          "tile_size": 256,
          "max_local_zoom": 2,
          "max_remote_zoom": 6,
          "local_template": "./data/tiles/mars-mola-elevation/{z}/{y}/{x}.jpg",
          "wmts_template": "https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg",
          "description": "Mars Global Surveyor MOLA lazer altimetre yükseklik ve gölgeli kabartma katmanı."
        },
        {
          "id": "mars-themis-day-ir",
          "name": "THEMIS Termal Kızılötesi",
          "type": "Thermal Infrared (IR)",
          "resolution": "100 m/px",
          "coverage": "Global (%98)",
          "format": "png",
          "tile_size": 256,
          "max_local_zoom": 2,
          "max_remote_zoom": 9,
          "local_template": "./data/tiles/mars-themis-day-ir/{z}/{y}/{x}.png",
          "wmts_template": "https://trek.nasa.gov/tiles/Mars/EQ/THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018/1.0.0/default/default028mm/{z}/{y}/{x}.png",
          "description": "Mars Odyssey THEMIS gündüz kızılötesi mozaiği; kaya yoğunluğu ve termal yüzey haritası."
        },
        {
          "id": "mars-global-geology",
          "name": "USGS SIM 3292 Jeoloji",
          "type": "Standardized Geologic Map",
          "resolution": "2000 m/px",
          "coverage": "Global (%100)",
          "format": "png",
          "tile_size": 256,
          "max_local_zoom": 1,
          "max_remote_zoom": 7,
          "local_template": "./data/tiles/mars-global-geology/{z}/{y}/{x}.png",
          "wmts_template": "https://trek.nasa.gov/mars/trekarcgis/rest/services/SIM3292_Global_Geology/MapServer/WMTS/tile/1.0.0/SIM3292_Global_Geology/default/default028mm/{z}/{y}/{x}.png",
          "description": "USGS Tanaka et al. (2014) standartlaştırılmış Noachian, Hesperian ve Amazonian jeoloji haritası."
        }
      ],
      "planetary_constants": {
        "equatorial_radius_km": 3396.19,
        "polar_radius_km": 3376.2,
        "volumetric_mean_radius_km": 3389.5,
        "surface_gravity_ms2": 3.72076,
        "solar_day_seconds_sol": 88775.244,
        "orbital_period_days": 686.98
      }
    },
    "./data/datasets/mars_landing_sites.json": {
      "_metadata": {
        "source": "NASA Jet Propulsion Laboratory (JPL) Mars Trek Portal",
        "url": "https://trek.nasa.gov/mars/",
        "reference_system": "IAU2000 Planetocentric Mars Coordinates",
        "mean_radius_km": 3389.5,
        "last_updated": "2026-11-14",
        "description": "Mars landing sites data extracted from NASA JPL Mars Trek and Planetary Data System."
      },
      "landing_sites": [
        {
          "id": "perseverance-jezero",
          "name": "Perseverance (Mars 2020) & Ingenuity",
          "landing_date": "2021-02-18",
          "status": "Active Operational",
          "site_name": "Octavia E. Butler Landing, Jezero Crater",
          "latitude": 18.4447,
          "longitude": 77.4508,
          "elevation_m": -2570,
          "target_geology": "Ancient lake delta, smectite clays, carbonate deposits",
          "instruments": [
            "SuperCam",
            "Mastcam-Z",
            "PIXL",
            "SHERLOC",
            "MOXIE",
            "MEDA",
            "RIMFAX"
          ],
          "traverse_distance_km": 31.4,
          "sample_tubes_dropped": 10
        },
        {
          "id": "curiosity-gale",
          "name": "Curiosity (Mars Science Laboratory)",
          "landing_date": "2012-08-06",
          "status": "Active Operational",
          "site_name": "Bradbury Landing, Gale Crater / Mount Sharp",
          "latitude": -4.5895,
          "longitude": 137.4417,
          "elevation_m": -4400,
          "target_geology": "Layered sedimentary sulfate and clay stratigraphy of Aeolis Mons",
          "instruments": [
            "ChemCam",
            "SAM",
            "CheMin",
            "Mastcam",
            "REMS",
            "DAN",
            "APXS",
            "MAHLI"
          ],
          "traverse_distance_km": 32.8,
          "elevation_gained_m": 820
        },
        {
          "id": "insight-elysium",
          "name": "InSight Lander",
          "landing_date": "2018-11-26",
          "status": "Mission Completed (2022)",
          "site_name": "Elysium Planitia",
          "latitude": 4.5024,
          "longitude": 135.6234,
          "elevation_m": -2613,
          "target_geology": "Smooth volcanic plains for internal seismology and heat probe",
          "instruments": [
            "SEIS (Seismometer)",
            "HP3 (Heat Flow Probe)",
            "RISE"
          ],
          "traverse_distance_km": 0
        },
        {
          "id": "opportunity-meridiani",
          "name": "Opportunity (MER-B)",
          "landing_date": "2004-01-25",
          "status": "Mission Completed (2018)",
          "site_name": "Eagle Crater, Meridiani Planum",
          "latitude": -1.9462,
          "longitude": 354.4734,
          "elevation_m": -1440,
          "target_geology": "Hematite spherules ('blueberries') and sulfate-rich evaporites",
          "instruments": [
            "Pancam",
            "Mini-TES",
            "Mössbauer Spectrometer",
            "APXS",
            "Microscopic Imager"
          ],
          "traverse_distance_km": 45.16
        },
        {
          "id": "spirit-gusev",
          "name": "Spirit (MER-A)",
          "landing_date": "2004-01-04",
          "status": "Mission Completed (2010)",
          "site_name": "Columbia Memorial Station, Gusev Crater",
          "latitude": -14.5684,
          "longitude": 175.4729,
          "elevation_m": -1940,
          "target_geology": "Basaltic plains, hydrothermal silica deposits at Home Plate",
          "instruments": [
            "Pancam",
            "Mini-TES",
            "Mössbauer Spectrometer",
            "APXS",
            "Microscopic Imager"
          ],
          "traverse_distance_km": 7.73
        },
        {
          "id": "pathfinder-ares",
          "name": "Mars Pathfinder & Sojourner",
          "landing_date": "1997-07-04",
          "status": "Mission Completed (1997)",
          "site_name": "Carl Sagan Memorial Station, Ares Vallis",
          "latitude": 19.33,
          "longitude": 326.45,
          "elevation_m": -3655,
          "target_geology": "Catastrophic outflow channel flood plain and conglomerate rocks",
          "instruments": [
            "IMP",
            "APXS",
            "ASI/MET"
          ],
          "traverse_distance_km": 0.1
        },
        {
          "id": "viking-1-chryse",
          "name": "Viking 1 Lander",
          "landing_date": "1976-07-20",
          "status": "Mission Completed (1982)",
          "site_name": "Thomas A. Mutch Memorial Station, Chryse Planitia",
          "latitude": 22.48,
          "longitude": 312.05,
          "elevation_m": -2690,
          "target_geology": "Volcanic and alluvial plain rocks with duricrust layer",
          "instruments": [
            "GCMS",
            "XRF",
            "Seismometer",
            "Biology experiments",
            "Meteorology"
          ],
          "traverse_distance_km": 0
        },
        {
          "id": "viking-2-utopia",
          "name": "Viking 2 Lander",
          "landing_date": "1976-09-03",
          "status": "Mission Completed (1980)",
          "site_name": "Utopia Planitia",
          "latitude": 47.97,
          "longitude": 134.02,
          "elevation_m": -4230,
          "target_geology": "Periglacial terrain, polygonized ground, water ice subsurface",
          "instruments": [
            "GCMS",
            "XRF",
            "Seismometer",
            "Biology experiments",
            "Meteorology"
          ],
          "traverse_distance_km": 0
        },
        {
          "id": "phoenix-vastitas",
          "name": "Phoenix Mars Lander",
          "landing_date": "2008-05-25",
          "status": "Mission Completed (2008)",
          "site_name": "Green Valley, Vastitas Borealis",
          "latitude": 68.22,
          "longitude": 234.25,
          "elevation_m": -4120,
          "target_geology": "Arctic subsurface pure water ice and perchlorate salts",
          "instruments": [
            "TEGA",
            "MECA",
            "SSI",
            "Meteorological Station"
          ],
          "traverse_distance_km": 0
        },
        {
          "id": "zhurong-utopia",
          "name": "Zhurong Rover (Tianwen-1)",
          "landing_date": "2021-05-15",
          "status": "Dormant",
          "site_name": "Southern Utopia Planitia",
          "latitude": 25.066,
          "longitude": 109.925,
          "elevation_m": -4100,
          "target_geology": "Hydrated sulfate and silica dunes in Utopia impact basin",
          "instruments": [
            "RoPeR (Subsurface Radar)",
            "MarSCoDe",
            "MSCam",
            "MCS"
          ],
          "traverse_distance_km": 1.92
        }
      ]
    },
    "./data/datasets/nasa_worldview_and_hazards.json": {
      "_metadata": {
        "source": "NASA Worldview (Earthdata GIBS) & Mars Atmospheric Climate Data",
        "url": "https://worldview.earthdata.nasa.gov/",
        "service": "Global Imagery Browse Services (GIBS) & Mars Climate Sounder (MCS)",
        "last_updated": "2026-11-14",
        "description": "Satellite perspective observation layers, Mars dust storm tracks, atmospheric hazards, and safe routing corridors."
      },
      "worldview_observation_layers": [
        {
          "layer_id": "MODIS_Terra_Dust_Aerosol",
          "platform": "NASA Earthdata GIBS / Planetary Analogs",
          "purpose": "Aerosol optical depth and storm tracking algorithm calibration",
          "wmts_endpoint": "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/wmts.cgi",
          "format": "image/png"
        },
        {
          "layer_id": "Mars_Climate_Sounder_Atmospheric_Dust",
          "platform": "Mars Reconnaissance Orbiter (MRO MCS)",
          "purpose": "3D profile of atmospheric dust, water ice clouds, and temperature soundings from 0 to 80 km altitude",
          "format": "PDS4 / NetCDF"
        }
      ],
      "mars_environmental_hazards": {
        "global_and_regional_dust_storm_corridors": [
          {
            "region_id": "hellas-basin-corridor",
            "name": "Hellas Impact Basin Storm Gateway",
            "center_lat": -42.7,
            "center_lon": 70,
            "hazard_type": "Primary Global Storm Trigger Zone",
            "dust_optical_depth_tau_max": 4.5,
            "risk_level": "CRITICAL",
            "description": "Deepest depression on Mars (-7.2 km); high atmospheric pressure triggers massive convective regional storms that often evolve into planet-encircling dust events."
          },
          {
            "region_id": "acidalia-chryse-storm-track",
            "name": "Acidalia - Chryse Northern Frontal Storm Track",
            "center_lat": 35,
            "center_lon": 325,
            "hazard_type": "Frontal Dust Storms & Wind Jet Corridor",
            "dust_optical_depth_tau_max": 2.8,
            "risk_level": "HIGH",
            "description": "Baroclinic frontal systems pushing cold polar dust fronts southwards toward equatorial exploration sites."
          },
          {
            "region_id": "solis-planum-trigger",
            "name": "Solis Planum High-Plateau Storm Zone",
            "center_lat": -26,
            "center_lon": 270,
            "hazard_type": "Thermal Anomaly Storm Origin",
            "dust_optical_depth_tau_max": 3.2,
            "risk_level": "HIGH",
            "description": "High thermal inertia and intense daytime ground heating creates severe dust devils and thermal dust lifting."
          }
        ],
        "atmospheric_and_chemical_weathering_hazards": {
          "acidic_atmospheric_interactions": {
            "hazard_name": "Volcanic Acidic Fog & Sulfate Aerosols (Vog Analog)",
            "active_regions": [
              "Tharsis volcanic flanks",
              "Cerberus Fossae fissures"
            ],
            "chemical_constituents": [
              "Sulfur dioxide (SO2)",
              "Hydrogen sulfide (H2S)",
              "Hydrochloric acid (HCl) condensates"
            ],
            "impact_on_rover_materials": "Surface oxidation, accelerated corrosion of metallic linkages, degradation of optical lens coatings."
          },
          "dust_devil_activity": {
            "frequency": "Highest during southern spring and summer (Ls 180 to 270)",
            "wind_speeds_ms": "Up to 30 m/s inside vortex cores",
            "electrostatic_discharge_volts_m": "Up to 20,000 V/m",
            "mitigation": "Equip rovers with grounded chassis and ESD-protected electronics."
          }
        },
        "safe_navigation_corridors": [
          {
            "corridor_id": "corridor-gale-southwest",
            "name": "Gale Crater Floor to Lower Mount Sharp",
            "safety_rating": "OPTIMAL",
            "reason": "Crater rim provides partial wind shielding from global storm jets; predictable bedrock navigation."
          },
          {
            "corridor_id": "corridor-jezero-delta-inlet",
            "name": "Jezero Neretva Vallis Delta Front",
            "safety_rating": "MODERATE_SAFE",
            "reason": "Firm deltaic sandstone; avoidance of northern boulder-choked mega-channels."
          }
        ]
      }
    },
    "./data/datasets/usgs_mars_geology.json": {
      "_metadata": {
        "source": "USGS-NASA Planetary Geologic Mapping Program & Astropedia",
        "map_reference": "Geologic Map of Mars, USGS Scientific Investigations Map 3292 (Tanaka et al., 2014)",
        "url": "https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars",
        "last_updated": "2026-11-14",
        "description": "Standardized geologic units, surface rock formations, and chemical weathering hazards of Mars."
      },
      "geologic_epochs": [
        {
          "epoch": "Noachian Period",
          "time_range_gya": "4.1 - 3.7 Billion Years Ago",
          "characteristics": "Heavy meteorite bombardment, liquid surface water, phyllosilicate (clay) formation, neutral-to-alkaline pH",
          "predominant_units": [
            {
              "unit_symbol": "eNh",
              "name": "Early Noachian Highland Unit",
              "lithology": "Brecciated impact crust, basaltic basement",
              "navigability_index": 0.45,
              "roughness": "Very High (cratered, steep scarps)"
            },
            {
              "unit_symbol": "mNh",
              "name": "Middle Noachian Highland Unit",
              "lithology": "Intercrater plains, clay-bearing impact ejecta",
              "navigability_index": 0.6,
              "roughness": "Moderate-High"
            },
            {
              "unit_symbol": "lNh",
              "name": "Late Noachian Highland Unit",
              "lithology": "Valley network terminal deltas, layered sediments",
              "navigability_index": 0.75,
              "roughness": "Moderate (suitable for rover science)"
            }
          ]
        },
        {
          "epoch": "Hesperian Period",
          "time_range_gya": "3.7 - 3.0 Billion Years Ago",
          "characteristics": "Widespread flood volcanism, catastrophic mega-outflow channels, sulfuric acid weathering, sulfate deposit formation",
          "predominant_units": [
            {
              "unit_symbol": "eHv",
              "name": "Early Hesperian Volcanic Unit",
              "lithology": "Ridged flood basalt plains (Hesperia Planum)",
              "navigability_index": 0.85,
              "roughness": "Low-Moderate (firm basaltic bedrock)"
            },
            {
              "unit_symbol": "lHl",
              "name": "Late Hesperian Lowland Unit",
              "lithology": "Outflow channel sediments, sulfate evaporite beds",
              "navigability_index": 0.7,
              "roughness": "Moderate (dune fields, yardangs)"
            }
          ]
        },
        {
          "epoch": "Amazonian Period",
          "time_range_gya": "3.0 Billion Years Ago to Present",
          "characteristics": "Hyper-arid cold desert, eolian erosion, perchlorate-rich dust accumulation, active dust storms, polar ice cap layering",
          "predominant_units": [
            {
              "unit_symbol": "eAv",
              "name": "Early Amazonian Volcanic Unit",
              "lithology": "Tharsis Montes and Olympus Mons basalt flows",
              "navigability_index": 0.5,
              "roughness": "High (aa lava, collapsed lava tubes)"
            },
            {
              "unit_symbol": "lApd",
              "name": "Late Amazonian Polar and Eolian Dunes",
              "lithology": "Active transverse sand dunes, water-ice/CO2 ice blankets",
              "navigability_index": 0.35,
              "roughness": "High entrapment hazard (soft sand, wheel sinkage)"
            }
          ]
        }
      ],
      "chemical_weathering_and_hazard_zones": {
        "acidic_sulfate_enrichment_regions": [
          {
            "region_name": "Vera Rubin Ridge & Sulfate Unit (Gale Crater)",
            "acidity_level": "Acid-sulfate alteration post-lake desiccation",
            "minerals": [
              "Magnesium sulfate",
              "Calcium sulfate",
              "Jarosite",
              "Hematite"
            ],
            "corrosion_hazard_for_rover": "Moderate (accelerated drill bit wear)"
          },
          {
            "region_name": "Meridiani Planum Evaporite Sequence",
            "acidity_level": "High acidity groundwaters (pH ~2 to 4 in ancient era)",
            "minerals": [
              "Jarosite",
              "Schwertmannite",
              "Silica"
            ],
            "corrosion_hazard_for_rover": "Low modern atmospheric corrosion; high soil salinity"
          }
        ],
        "perchlorate_soil_concentrations": {
          "average_regolith_wt_percent": "0.5% - 1.0% ClO4-",
          "impact_on_exploration": "Strong oxidizer; toxic to human tissue; lowers freezing point of water to create transient brines."
        }
      }
    },
    "./data/datasets/curiosity_mount_sharp_route.json": {
      "_metadata": {
        "source": "NASA Science & Jet Propulsion Laboratory (JPL)",
        "resource_title": "Curiosity's Proposed Path Up Mount Sharp (Aeolis Mons)",
        "url": "https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/",
        "landing_site": "Bradbury Landing, Gale Crater (-4.5895 S, 137.4417 E)",
        "mission": "Mars Science Laboratory (MSL)",
        "last_updated": "2026-11-14",
        "description": "Annotated waypoints, elevation profiles, and route terrain hazards for Curiosity's ascent of lower Mount Sharp."
      },
      "route_overview": {
        "target_mountain": "Mount Sharp (Aeolis Mons)",
        "total_mountain_height_m": 5500,
        "exploration_zone": "Lower strata (Pahrump Hills up to Gediz Vallis and Boxwork structures)",
        "primary_objective": "Determine the transition from warm, wet habitable lake environments (clays) to dry, hyper-acidic desert conditions (sulfates)."
      },
      "waypoints": [
        {
          "sequence": 1,
          "name": "Bradbury Landing",
          "sol_reached": 0,
          "latitude": -4.5895,
          "longitude": 137.4417,
          "elevation_m": -4400,
          "slope_degrees": 1.2,
          "terrain_type": "Smooth alluvial plains, fine gravel",
          "hazard_level": "Low",
          "scientific_target": "Landing touchdown verification and system checkout"
        },
        {
          "sequence": 2,
          "name": "Yellowknife Bay",
          "sol_reached": 125,
          "latitude": -4.592,
          "longitude": 137.448,
          "elevation_m": -4420,
          "slope_degrees": 2.5,
          "terrain_type": "Mudstone sedimentary rock (ancient lake bed)",
          "hazard_level": "Low",
          "scientific_target": "Discovery of ancient habitable freshwater lake with C, H, N, O, P, S"
        },
        {
          "sequence": 3,
          "name": "Pahrump Hills (Mount Sharp Base)",
          "sol_reached": 753,
          "latitude": -4.675,
          "longitude": 137.385,
          "elevation_m": -4450,
          "slope_degrees": 6.8,
          "terrain_type": "Murray formation mudstone with mineral veins",
          "hazard_level": "Moderate (loose scree, outcrop ledges)",
          "scientific_target": "First basal unit of Mount Sharp"
        },
        {
          "sequence": 4,
          "name": "Bagnold Dunes (Oasis)",
          "sol_reached": 1170,
          "latitude": -4.685,
          "longitude": 137.378,
          "elevation_m": -4420,
          "slope_degrees": 14.5,
          "terrain_type": "Active dark basaltic sand dunes with ripple fields",
          "hazard_level": "High (wheel slippage, sand entrapment risk)",
          "scientific_target": "First in-situ investigation of active extraterrestrial dune field"
        },
        {
          "sequence": 5,
          "name": "Vera Rubin Ridge",
          "sol_reached": 1800,
          "latitude": -4.72,
          "longitude": 137.362,
          "elevation_m": -4210,
          "slope_degrees": 18,
          "terrain_type": "Hematite-rich erosion-resistant bedrock ridge",
          "hazard_level": "High (steep inclines, wheel puncture risk from ventifacts)",
          "scientific_target": "Strong orbital hematite signature and iron oxide crystallization"
        },
        {
          "sequence": 6,
          "name": "Glen Torridon (Clay-Bearing Unit)",
          "sol_reached": 2300,
          "latitude": -4.735,
          "longitude": 137.38,
          "elevation_m": -4240,
          "slope_degrees": 4.5,
          "terrain_type": "Low-lying troughs, soft clay-rich bedrock (smectites)",
          "hazard_level": "Low-Moderate (gentle driving)",
          "scientific_target": "Highest concentration of clay minerals found in Gale Crater"
        },
        {
          "sequence": 7,
          "name": "Greenheugh Pediment",
          "sol_reached": 2700,
          "latitude": -4.745,
          "longitude": 137.34,
          "elevation_m": -4150,
          "slope_degrees": 31,
          "terrain_type": "Capping sandstone unconformity, extreme steep incline",
          "hazard_level": "Severe (steepest climb tackled by Curiosity: 31 deg tilt)",
          "scientific_target": "Erosional boundary and major planetary timescale transition"
        },
        {
          "sequence": 8,
          "name": "Sulfate-Bearing Unit",
          "sol_reached": 3200,
          "latitude": -4.76,
          "longitude": 137.36,
          "elevation_m": -4020,
          "slope_degrees": 11.2,
          "terrain_type": "Magnesium and calcium sulfate layers, polyhydrated minerals",
          "hazard_level": "Moderate-High (knife-blade rocks, boxwork fractures)",
          "scientific_target": "Drying of ancient Mars and transition to acidic hyper-saline waters"
        },
        {
          "sequence": 9,
          "name": "Gediz Vallis Channel",
          "sol_reached": 3900,
          "latitude": -4.785,
          "longitude": 137.375,
          "elevation_m": -3900,
          "slope_degrees": 15.4,
          "terrain_type": "Debris flow ridge, large boulders transported by water/mud floods",
          "hazard_level": "High (boulder field navigation, rough terrain)",
          "scientific_target": "Last major wet events and violent flash floods on Mount Sharp"
        }
      ],
      "routing_risk_parameters": {
        "max_safe_slope_degrees": 25,
        "critical_wheel_slip_threshold": 0.4,
        "roughness_limit_cm": 30,
        "battery_charge_margin_percent": 35
      }
    }
  };
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-5: JSDoc cevrimdisi file:// uyumlu NASA/USGS veri yedek modulu aciklamasi.
   - Satir 7-10: IIFE kapsulü; yerel JSON katalogunu window.AstroChief.OFFLINE_DATASETS altina kaydeder.
   ========================================================================== */
