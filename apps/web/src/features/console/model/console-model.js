// The console's model: the Lone Star Freight workspace (loads, drivers, equipment, owners, statements, fuel and
// the rest), the role and permission rules, and the builders that turn "this screen, this role, this interface
// state" into the values the screens render.
//
// It is the logic of the FlyFleet design, carried over as written so that every value on screen matches it.
// `ConsoleLogic` at the end is the entry point: the provider gives it props and state and calls renderVals().
// The result is described by ConsoleView in ../view.ts.
//
// Nothing here talks to the network or to storage. As screens are connected to the API, their builders take
// their records from it instead of the constants below.

const I = {"ffmark":"M4 6l6 6-6 6M13 6l6 6-6 6","chevR":"M9 6l6 6-6 6","chevL":"M15 6l-6 6 6 6","chevD":"M6 9l6 6 6-6","chevU":"M18 15l-6-6-6 6","updown":"M7 15l5 5 5-5M7 9l5-5 5 5","plus":"M12 5v14M5 12h14","x":"M18 6L6 18M6 6l12 12","search":"M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35","pin":"M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z","bell":"M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0","help":"M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01","spark":"M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z","dash":"M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z","tasks":"M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11","dispatch":"M3 5h18v14H3zM3 10h18M8 5v14","loads":"M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8","alert":"M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01","building":"M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4","user":"M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z","truck":"M1 5h14v11H1zM15 9h4l3 3v4h-7zM5.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z","shield":"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4","wrench":"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z","file":"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5","dollar":"M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6","invoice":"M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4","chart":"M3 3v18h18M8 17v-6M13 17V7M18 17v-4","team":"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75","sliders":"M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6","msg":"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z","history":"M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2","globe":"M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20","lock":"M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4","check":"M5 12l5 5 9-10","clock":"M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2","more":"M5 12h.01M12 12h.01M19 12h.01","ext":"M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6","phone":"M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z","send":"M22 2L11 13M22 2l-7 20-4-9-9-4z","clip":"M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5","upload":"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12","download":"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3","filter":"M22 3H2l8 9.5V19l4 2v-8.5z","cols":"M3 4h18v16H3zM9 4v16M15 4v16","sort":"M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4","refresh":"M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15","eye":"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z","map":"M9 20l-6-3V4l6 3 6-3 6 3v13l-6-3-6 3zM9 7v13M15 4v13","gauge":"M12 14l4-4M3.3 19A10 10 0 1 1 20.7 19","scan":"M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10","camera":"M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z","rotate":"M1 4v6h6M3.5 15a9 9 0 1 0 2.1-9.4L1 10","crop":"M6.1 2v14a2 2 0 0 0 2 2H22M2 6.1h14a2 2 0 0 1 2 2V22","zoom":"M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35M11 8v6M8 11h6","wand":"M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5","link":"M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7","mail":"M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6","mobile":"M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18h.01","wifioff":"M1 1l22 22M16.7 11.1A11 11 0 0 1 19 12.6M5 12.6a11 11 0 0 1 5.2-2.5M10.7 5A16 16 0 0 1 22.6 9M1.4 9a16 16 0 0 1 4.7-2.9M8.5 16.1a6 6 0 0 1 7 0M12 20h.01","info":"M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01","deny":"M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM4.9 4.9l14.2 14.2","layers":"M12 2l10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5","play":"M6 4l14 8-14 8z","trend":"M23 6l-9.5 9.5-5-5L1 18M17 6h6v6","flag":"M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7","star":"M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2L7 14.2 2 9.3l6.9-1z","cal":"M3 5h18v16H3zM16 3v4M8 3v4M3 10h18","userplus":"M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6","key":"M15 7a2 2 0 0 1 2 2M21 9a6 6 0 0 1-7.7 5.8L11 17H9v2H7v2H3v-3.6l6.2-6.2A6 6 0 1 1 21 9z","grip":"M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01","arrowR":"M5 12h14M13 6l6 6-6 6","arrowU":"M12 19V5M5 12l7-7 7 7","navarrow":"M12 2l7 19-7-4-7 4z","box":"M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z","pencil":"M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z","copy":"M9 9h13v13H9zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1","cpu":"M4 4h16v16H4zM9 9h6v6H9zM9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3","zap":"M13 2L3 14h9l-1 8 10-12h-9z","pause":"M6 4h4v16H6zM14 4h4v16h-4z","thumb":"M7 10v12M15 5.9L14 10h5.8a2 2 0 0 1 2 2.3l-1.4 9a2 2 0 0 1-2 1.7H7V10l4-8a3 3 0 0 1 4 3.9z","fuel":"M3 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M3 22h12M15 11h2a2 2 0 0 1 2 2v3a2 2 0 0 0 4 0V8l-4-4M7 7h4","sun":"M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4","logout":"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9","inbox":"M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z","sig":"M3 17c3-1 4-9 6-9s1 7 3 7 2-4 4-4 1 3 5 3M3 21h18","hash":"M4 9h16M4 15h16M10 3L8 21M16 3l-2 18","trailer":"M2 5h17v10H2zM16 15v4M14 19h4M5.5 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM10 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z","sheet":"M4 3h16v18H4zM4 9h16M4 15h16M10 3v18","panel":"M3 4h18v16H3zM9 4v16M16 9l-3 3 3 3","kbd":"M2 6h20v12H2zM6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10","inspect":"M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4"};
// ---------------------------------------------------------------- reference data
// Lifecycle status (state machine) is kept separate from risk (exception flag).
const STL = {draft:'Draft',planned:'Planned',assigned:'Assigned',dispatched:'Dispatched',atpickup:'At pickup',transit:'In transit',atdelivery:'At delivery',delivered:'Delivered',podreview:'POD review',completed:'Completed',hold:'On hold',cancelled:'Cancelled'};
const FLOW = ['draft','planned','assigned','dispatched','atpickup','transit','atdelivery','delivered','podreview','completed'];
const MOVING = ['dispatched','atpickup','transit','atdelivery'];

const LOADS = [
  {id:'FF-24851',ref:'PO 88213',st:'planned',rk:'warn',rkt:'No driver · pickup in 2h 40m',cust:'Owens Corning',pu:'Waxahachie, TX',puT:'Nov 13 · 14:00',pf:'Owens Corning Plant 2',del:'Shreveport, LA',delT:'Nov 14 · 08:00',df:'ABC Supply #418',mi:214,rate:1150,docs:1,eq:'53’ Dry van'},
  {id:'FF-24817',ref:'PO 71904',st:'transit',rk:'bad',rkt:'ETA +1h 40m',cust:'Walmart Transportation',pu:'Fort Worth, TX',puT:'Nov 13 · 06:30',pf:'Walmart DC 7012',del:'Oklahoma City, OK',delT:'Nov 13 · 15:00',df:'Walmart DC 6094',drv:'Ana Ruiz',trk:'1108',trl:'5312',mi:205,rate:1480,docs:2,eq:'53’ Dry van',arr:'06:22',dep:'07:05',eta:'16:40',late:'1h 40m',pos:'I-35 N near Ardmore, OK',done:128},
  {id:'FF-24801',ref:'BOL 55120',st:'transit',cust:'Home Depot Supply',pu:'Dallas, TX',puT:'Nov 13 · 05:00',pf:'HD Supply Dallas DC',del:'Houston, TX',delT:'Nov 13 · 12:30',df:'HD Supply Houston #2',drv:'Marcus Bell',trk:'1142',trl:'5288',mi:239,rate:1320,docs:2,eq:'53’ Dry van',arr:'04:51',dep:'05:20',eta:'12:10',pos:'I-45 S near Spring, TX',done:214},
  {id:'FF-24839',ref:'SO 40217',st:'transit',rk:'late',rkt:'ETA +35m',cust:'Sysco North Texas',pu:'Lewisville, TX',puT:'Nov 13 · 09:00',pf:'Sysco Lewisville',del:'Austin, TX',delT:'Nov 13 · 15:30',df:'Sysco Central Texas',drv:'Jamal Carter',trk:'1121',trl:'5301',mi:213,rate:1240,docs:2,eq:'53’ Reefer',arr:'08:52',dep:'09:40',eta:'16:05',late:'35m',pos:'I-35 S near Temple, TX',done:149},
  {id:'FF-24828',ref:'PO 30992',st:'atpickup',cust:'Georgia-Pacific',pu:'Irving, TX',puT:'Nov 13 · 10:30',pf:'GP Irving Mill',del:'Little Rock, AR',delT:'Nov 13 · 18:00',df:'GP Little Rock DC',drv:'Luis Ortega',trk:'1133',trl:'5276',mi:319,rate:1890,docs:1,eq:'53’ Dry van',arr:'10:24',eta:'17:35',pos:'GP Irving Mill, door 14',done:0},
  {id:'FF-24846',ref:'PO 66310',st:'transit',cust:'PepsiCo Logistics',pu:'Garland, TX',puT:'Nov 13 · 07:00',pf:'PepsiCo Garland',del:'Tulsa, OK',delT:'Nov 13 · 14:00',df:'PepsiCo Tulsa DC',drv:'Priya Shah',trk:'1155',trl:'5319',mi:257,rate:1610,docs:2,eq:'53’ Dry van',arr:'06:48',dep:'07:25',eta:'13:45',pos:'US-69 N near McAlester, OK',done:190},
  {id:'FF-24855',ref:'BOL 55168',st:'assigned',cust:'Home Depot Supply',pu:'Houston, TX',puT:'Nov 13 · 14:00',pf:'HD Supply Houston #2',del:'San Antonio, TX',delT:'Nov 13 · 19:00',df:'HD Supply San Antonio',drv:'Marcus Bell',trk:'1142',trl:'5288',mi:197,rate:980,docs:1,eq:'53’ Dry van'},
  {id:'FF-24870',ref:'PO 71988',st:'assigned',cust:'Walmart Transportation',pu:'Dallas, TX',puT:'Nov 13 · 15:00',pf:'Walmart DC 7013',del:'Abilene, TX',delT:'Nov 13 · 20:30',df:'Walmart DC 6031',drv:'Kara Nguyen',trk:'1160',trl:'5322',mi:181,rate:1190,docs:1,eq:'53’ Dry van'},
  {id:'FF-24790',ref:'PO 29871',st:'delivered',rk:'bad',rkt:'POD missing',cust:'Kimberly-Clark',pu:'Paris, TX',puT:'Nov 11 · 08:00',pf:'Kimberly-Clark Paris Mill',del:'Memphis, TN',delT:'Nov 12 · 09:00',df:'K-C Memphis DC',drv:'Ben Okafor',trk:'1117',trl:'5264',mi:412,rate:2240,docs:2,eq:'53’ Dry van',arr:'07:41',dep:'08:15'},
  {id:'FF-24782',ref:'PO 29802',st:'podreview',cust:'Home Depot Supply',pu:'Dallas, TX',puT:'Nov 12 · 06:00',pf:'HD Supply Dallas DC',del:'Shreveport, LA',delT:'Nov 12 · 11:30',df:'HD Supply Shreveport #6',drv:'Sam Whitfield',trk:'1102',trl:'5259',mi:190,rate:1040,docs:3,eq:'53’ Dry van',arr:'05:48',dep:'06:20'},
  {id:'FF-24862',ref:'SO 40288',st:'draft',rk:'warn',rkt:'No rate confirmation',cust:'Sysco North Texas',pu:'Lewisville, TX',puT:'Nov 14 · 06:00',pf:'Sysco Lewisville',del:'Waco, TX',delT:'Nov 14 · 10:00',df:'Sysco Waco',mi:128,rate:720,docs:0,eq:'53’ Reefer'},
  {id:'FF-24833',ref:'PO 66297',st:'hold',rk:'warn',rkt:'Customer hold',cust:'PepsiCo Logistics',pu:'Garland, TX',puT:'Nov 13 · 08:00',pf:'PepsiCo Garland',del:'Lubbock, TX',delT:'Nov 14 · 07:00',df:'PepsiCo Lubbock',drv:'Tom Reyes',trk:'1129',trl:'5290',mi:344,rate:1950,docs:1,eq:'53’ Dry van'},
  {id:'FF-24775',ref:'PO 88120',st:'completed',cust:'Owens Corning',pu:'Waxahachie, TX',puT:'Nov 10 · 07:00',pf:'Owens Corning Plant 2',del:'El Paso, TX',delT:'Nov 11 · 10:00',df:'Builders FirstSource',drv:'Ana Ruiz',trk:'1108',trl:'5312',mi:584,rate:2980,docs:3,eq:'53’ Dry van',arr:'06:40',dep:'07:10'},
  {id:'FF-24809',ref:'PO 30951',st:'cancelled',cust:'Georgia-Pacific',pu:'Irving, TX',puT:'Nov 12 · 13:00',pf:'GP Irving Mill',del:'Shreveport, LA',delT:'Nov 12 · 19:00',df:'GP Shreveport',mi:190,rate:1050,docs:0,eq:'53’ Dry van'},
  {id:'FF-24873',ref:'SO 40301',st:'planned',rk:'warn',rkt:'No driver',cust:'Sysco North Texas',pu:'Dallas, TX',puT:'Nov 13 · 17:00',pf:'Sysco Dallas',del:'Lubbock, TX',delT:'Nov 14 · 03:00',df:'Sysco West Texas',mi:345,rate:1880,docs:1,eq:'53’ Reefer'},
  {id:'FF-24866',ref:'BOL 55190',st:'assigned',cust:'Home Depot Supply',pu:'Waco, TX',puT:'Nov 13 · 12:00',pf:'HD Supply Waco',del:'Dallas, TX',delT:'Nov 13 · 16:00',df:'HD Supply Dallas DC',drv:'Sam Whitfield',trk:'1102',trl:'5259',mi:97,rate:640,docs:1,eq:'53’ Dry van'},
];

// drivers: qualification items = CDL, medical card, MVR review, clearinghouse, road test, drug test
const DRIVERS = [
  {n:'Marcus Bell',i:'MB',t:'1142',tr:'5288',st:'On load',sk:'transit',term:'Dallas',ph:'(214) 555-0148',cdl:'A · TX',q:[['ok','Aug 2028'],['warn','6 days'],['ok','Mar 2027'],['ok','Jan 2027'],['ok','On file'],['ok','On file']],tg:1,app:1,lic:'4821',hired:'Mar 2021',emp:'D-1042'},
  {n:'Ana Ruiz',i:'AR',t:'1108',tr:'5312',st:'On load',sk:'transit',term:'Dallas',ph:'(214) 555-0193',cdl:'A · TX',q:[['warn','19 days'],['ok','Jun 2027'],['ok','Feb 2027'],['ok','Jan 2027'],['ok','On file'],['ok','On file']],tg:1,app:1,lic:'0937',hired:'Aug 2019',emp:'D-1017'},
  {n:'Jamal Carter',i:'JC',t:'1121',tr:'5301',st:'On load',sk:'transit',term:'Dallas',ph:'(469) 555-0127',cdl:'A · TX',q:[['ok','May 2029'],['ok','Sep 2027'],['ok','Apr 2027'],['ok','Feb 2027'],['ok','On file'],['ok','On file']],tg:1,app:1,lic:'5530',hired:'Jun 2019',emp:'D-1011'},
  {n:'Priya Shah',i:'PS',t:'1155',tr:'5319',st:'On load',sk:'transit',term:'Dallas',ph:'(972) 555-0162',cdl:'A · TX',q:[['ok','Jan 2029'],['ok','Jul 2027'],['ok','May 2027'],['ok','Mar 2027'],['ok','On file'],['ok','On file']],tg:0,app:1,lic:'7712',hired:'Feb 2023',emp:'D-1088'},
  {n:'Luis Ortega',i:'LO',t:'1133',tr:'5276',st:'At pickup',sk:'atpickup',term:'Dallas',ph:'(214) 555-0175',cdl:'A · TX',q:[['ok','Oct 2027'],['ok','Apr 2027'],['ok','Jan 2027'],['ok','Dec 2026'],['ok','On file'],['ok','On file']],tg:1,app:1,lic:'2290',hired:'Nov 2020',emp:'D-1036'},
  {n:'Ben Okafor',i:'BO',t:'1117',tr:'5264',st:'Available',sk:'ok',term:'Dallas',ph:'(469) 555-0110',cdl:'A · TX',q:[['ok','Dec 2028'],['ok','Mar 2027'],['ok','Jun 2027'],['ok','Apr 2027'],['ok','On file'],['ok','On file']],tg:1,app:1,lic:'6604',hired:'Jan 2022',emp:'D-1061'},
  {n:'Tom Reyes',i:'TR',t:'1129',tr:'5290',st:'On hold load',sk:'hold',term:'Dallas',ph:'(972) 555-0148',cdl:'A · TX',q:[['ok','Jul 2028'],['warn','24 days'],['ok','Aug 2027'],['ok','May 2027'],['ok','On file'],['ok','On file']],tg:1,app:1,lic:'3318',hired:'Apr 2018',emp:'D-1004'},
  {n:'Kara Nguyen',i:'KN',t:'1160',tr:'5322',st:'Starts 15:00',sk:'assigned',term:'Dallas',ph:'(214) 555-0136',cdl:'A · TX',q:[['ok','Feb 2030'],['info','In review'],['ok','Sep 2027'],['ok','Jun 2027'],['ok','On file'],['ok','On file']],tg:1,app:1,lic:'8840',hired:'Sep 2024',emp:'D-1102'},
  {n:'Sam Whitfield',i:'SW',t:'1102',tr:'5259',st:'On load',sk:'assigned',term:'Dallas',ph:'(254) 555-0181',cdl:'A · TX',q:[['ok','Mar 2028'],['ok','Feb 2027'],['ok','Dec 2026'],['ok','Jan 2027'],['ok','On file'],['ok','On file']],tg:0,app:1,lic:'1457',hired:'May 2020',emp:'D-1029'},
  {n:'Devon Price',i:'DP',t:'1149',tr:'5317',st:'Available',sk:'ok',term:'Dallas',ph:'(469) 555-0154',cdl:'A · TX',q:[['ok','Nov 2028'],['ok','Aug 2027'],['warn','12 days'],['ok','Mar 2027'],['ok','On file'],['ok','On file']],tg:0,app:1,lic:'9023',hired:'Jul 2024',emp:'D-1097'},
  {n:'Leah Morgan',i:'LM',t:'1138',tr:'5302',st:'Off duty',sk:'mu',term:'Houston',ph:'(713) 555-0109',cdl:'A · TX',q:[['ok','Sep 2027'],['ok','May 2027'],['ok','Apr 2027'],['ok','Feb 2027'],['bad','Missing'],['ok','On file']],tg:1,app:1,lic:'4475',hired:'Oct 2025',emp:'D-1115'},
  {n:'Victor Hale',i:'VH',t:'—',tr:'—',st:'Inactive',sk:'mu',term:'Dallas',ph:'(214) 555-0199',cdl:'A · TX',q:[['ok','Jun 2027'],['bad','Expired Nov 2'],['ok','Jan 2027'],['bad','Missing'],['ok','On file'],['ok','On file']],tg:0,app:0,lic:'6182',hired:'Feb 2017',emp:'D-0998'},
];
const QNAMES = ['CDL','Medical card','MVR review','Clearinghouse','Road test','Drug test'];
const QFULL = ['CDL — Class A','Medical certificate','MVR — annual review','Drug & alcohol clearinghouse query','Road test certificate','Pre-employment drug test'];

const QUEUE = [
  {id:'FF-24851',a:'Waxahachie, TX',b:'Shreveport, LA',when:'Today 14:00–16:00',mi:214,eq:'53’ Dry van',cust:'Owens Corning',rate:1150,urg:'Pickup in 2h 40m',uk:'warn',hot:1},
  {id:'FF-24873',a:'Dallas, TX',b:'Lubbock, TX',when:'Today 17:00–19:00',mi:345,eq:'53’ Reefer',cust:'Sysco North Texas',rate:1880,urg:'Pickup in 5h 40m',uk:'mu'},
  {id:'FF-24862',a:'Lewisville, TX',b:'Waco, TX',when:'Tomorrow 06:00',mi:128,eq:'53’ Reefer',cust:'Sysco North Texas',rate:720,urg:'Draft · no rate con',uk:'mu'},
  {id:'FF-24877',a:'Irving, TX',b:'Little Rock, AR',when:'Tomorrow 08:00–10:00',mi:319,eq:'53’ Dry van',cust:'Georgia-Pacific',rate:1840,urg:'Tomorrow',uk:'mu'},
  {id:'FF-24880',a:'Garland, TX',b:'Amarillo, TX',when:'Tomorrow 09:00',mi:362,eq:'48’ Flatbed',cust:'PepsiCo Logistics',rate:2050,urg:'No flatbed free',uk:'bad'},
];

// [id, lane, start hour, end hour, status, risk]
const BOARD = [
  {n:'Marcus Bell',blocks:[['FF-24801','DAL → HOU',5,12.5,'transit'],['FF-24855','HOU → SAT',14,19,'assigned']]},
  {n:'Ana Ruiz',blocks:[['FF-24817','FTW → OKC · ETA +1h 40m',6.5,16.67,'transit','bad']]},
  {n:'Jamal Carter',blocks:[['FF-24839','LEW → AUS · ETA +35m',9,16.1,'transit','late']]},
  {n:'Priya Shah',blocks:[['FF-24846','GAR → TUL',7,13.75,'transit']]},
  {n:'Luis Ortega',blocks:[['FF-24828','IRV → LIT · at pickup',10.4,18,'atpickup']]},
  {n:'Ben Okafor',chip:'Available',blocks:[]},
  {n:'Tom Reyes',blocks:[['FF-24833','GAR → LBB · on hold',8,12,'hold']]},
  {n:'Kara Nguyen',chip:'Free until 15:00',blocks:[['FF-24870','DAL → ABI',15,20.5,'assigned']]},
  {n:'Sam Whitfield',blocks:[['FF-24812','DAL → WAC',6,10,'delivered'],['FF-24866','WAC → DAL',12,16,'assigned']]},
  {n:'Devon Price',chip:'Available',blocks:[]},
];

const CUSTOMERS = [
  ['Walmart Transportation','CUST-0012','Active','ok','Kelly Moore','Net 30','46',62410,'92%'],
  ['Home Depot Supply','CUST-0007','Active','ok','Tony Ruiz','Net 30','58',48920,'96%'],
  ['Sysco North Texas','CUST-0021','Active','ok','Marisol Vega','Net 15','39',21330,'89%'],
  ['PepsiCo Logistics','CUST-0015','Active','ok','Greg Holt','Net 30','33',27640,'94%'],
  ['Georgia-Pacific','CUST-0009','Active','ok','Ann Patel','Net 45','21',18200,'97%'],
  ['Kimberly-Clark','CUST-0004','Credit review','warn','Ross Turner','Net 30','14',14880,'86%'],
  ['Owens Corning','CUST-0018','Active','ok','Lena Brooks','Net 30','19',9760,'95%'],
  ['ABC Supply','CUST-0031','Active','ok','Dwayne Fox','Net 30','6',2140,'100%'],
  ['Builders FirstSource','CUST-0026','Archived','mu','—','Net 30','0',0,'—'],
];

const TRUCKS = [
  ['T-1102','Freightliner Cascadia · 2021','TX · R4K 2291','Assigned','assigned','Waco','412,880','FF-24866','PM-B in 1,120 mi','warn','Live'],
  ['T-1108','Freightliner Cascadia · 2022','TX · R4M 8810','Assigned','assigned','Dallas','318,402','FF-24817','PM-A in 6,300 mi','mu','Live'],
  ['T-1117','Volvo VNL 760 · 2023','TX · S2B 4417','Available','ok','Dallas','188,950','—','PM-A in 2,140 mi','mu','Live'],
  ['T-1121','Kenworth T680 · 2022','TX · R9C 1205','Assigned','assigned','Dallas','276,115','FF-24839','Annual inspection in 11 d','warn','Live'],
  ['T-1129','Peterbilt 579 · 2021','TX · R1F 6630','Assigned','assigned','Dallas','351,027','FF-24833','PM-A in 3,800 mi','mu','Live'],
  ['T-1133','Freightliner Cascadia · 2023','TX · S7D 0092','Assigned','assigned','Dallas','141,380','FF-24828','PM-A in 9,000 mi','mu','Live'],
  ['T-1138','International LT · 2020','TX · P8K 3321','Out of service','bad','Houston','498,770','—','WO-1170 · waiting parts','bad','No signal'],
  ['T-1142','Kenworth T680 · 2023','TX · S1A 7781','Assigned','assigned','Dallas','122,904','FF-24801','PM-A in 7,450 mi','mu','Live'],
  ['T-1149','Volvo VNL 760 · 2021','TX · R6H 5502','Available','ok','Dallas','366,213','—','Return-to-service check','warn','Stale 47 m'],
  ['T-1155','Freightliner Cascadia · 2022','TX · R8N 2219','Assigned','assigned','Dallas','298,661','FF-24846','PM-A in 4,900 mi','mu','Live'],
  ['T-1160','Peterbilt 579 · 2023','TX · S3J 9105','Assigned','assigned','Dallas','98,440','FF-24870','PM-A in 11,200 mi','mu','Live'],
  ['T-1163','Mack Anthem · 2020','TX · P2T 7718','In maintenance','warn','Dallas','521,309','—','WO-1175 · PM-A in shop','warn','Live'],
];

const INVOICES = [
  ['INV-10482','Kimberly-Clark','3','Oct 2','Nov 1',6720,6720,'Overdue','bad','12 days late'],
  ['INV-10477','Walmart Transportation','5','Oct 8','Nov 7',8410,2410,'Partially paid','warn','6 days late'],
  ['INV-10495','Sysco North Texas','2','Oct 24','Nov 8',2560,2560,'Overdue','bad','5 days late'],
  ['INV-10501','Home Depot Supply','4','Nov 2','Dec 2',5180,5180,'Sent','info','Due in 19 days'],
  ['INV-10506','PepsiCo Logistics','3','Nov 6','Dec 6',4830,4830,'Sent','info','Due in 23 days'],
  ['INV-10509','Georgia-Pacific','1','Nov 9','Dec 24',1890,1890,'Sent','info','Due in 41 days'],
  ['INV-10511','Owens Corning','1','Nov 11','Dec 11',2980,2980,'Sent','info','Due in 28 days'],
  ['INV-10512','Walmart Transportation','2','—','—',2670,2670,'Draft','draft','Ready to issue'],
  ['INV-10513','Home Depot Supply','1','—','—',1040,1040,'Draft','draft','Waiting on POD review'],
  ['INV-10468','Home Depot Supply','6','Sep 28','Oct 28',7940,0,'Paid','ok','Paid Oct 27'],
  ['INV-10471','PepsiCo Logistics','2','Sep 30','Oct 30',3220,0,'Paid','ok','Paid Oct 30'],
  ['INV-10460','Sysco North Texas','1','Sep 22','Oct 7',1150,0,'Void','mu','Reissued as INV-10466'],
];

const SETTLEMENTS = [
  ['Ana Ruiz','AR','6','Per mile · $0.62','2,210 mi',1370.20,-185.00,75.00,'In review','info'],
  ['Marcus Bell','MB','7','Per mile · $0.62','2,486 mi',1541.32,-160.00,0,'In review','info'],
  ['Jamal Carter','JC','5','Per mile · $0.64','1,904 mi',1218.56,-120.00,45.00,'Approved','ok'],
  ['Luis Ortega','LO','4','Owner-op · 72% of line haul','$6,120 line haul',4406.40,-1180.00,0,'Approved','ok'],
  ['Priya Shah','PS','6','Per mile · $0.60','2,035 mi',1221.00,-95.00,0,'Draft','draft'],
  ['Ben Okafor','BO','5','Per mile · $0.62','2,312 mi',1433.44,-140.00,60.00,'Draft','draft'],
  ['Tom Reyes','TR','3','Owner-op · 70% of line haul','$4,880 line haul',3416.00,-940.00,0,'In review','info'],
  ['Kara Nguyen','KN','4','Per mile · $0.58','1,620 mi',939.60,-85.00,0,'Draft','draft'],
  ['Sam Whitfield','SW','6','Per mile · $0.62','1,488 mi',922.56,-110.00,30.00,'Paid','completed'],
  ['Devon Price','DP','4','Per mile · $0.58','1,702 mi',987.16,-90.00,0,'Draft','draft'],
];

// ---------------------------------------------------------------- cell helpers
const fm = n => '$' + Math.round(n).toLocaleString('en-US');
const fm2 = n => (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
const T = {
  tx:(v,s,cls,scls)=>({isTx:1,v,s:s||'',cls:cls||'',scls:scls||''}),
  id:(v,s,go)=>({isId:1,v,s:s||'',go}),
  b:(v,k)=>({isBadge:1,v,k}),
  rk:(v,k,ic)=>({isRisk:1,v,k,ic:ic||(k==='ok'?I.check:(k==='bad'?I.alert:I.clock))}),
  p:(v,i,s,k)=>({isP:1,v,ini:i,s:s||'',k:k||''}),
  m:(v,s,cls)=>({isM:1,v,s:s||'',cls:cls||'',al:'rt'}),
  n:(v,s)=>({isTx:1,v,s:s||'',cls:'num',scls:'',al:'rt'}),
  bar:(v,pct,k)=>({isBar:1,v,pct,k}),
  dots:(v,dots,k)=>({isDots:1,v,dots,k}),
  tags:tags=>({isTags:1,tags}),
  docs:(n,podMissing)=>({isDocs:1,v:n+'/3',k:n===3?'ok':(podMissing?'bad':'mu'),bars:[0,1,2].map(i=>i<n?'ok':(podMissing?'bad':'off'))}),
  ch:list=>({isCh:1,ch:list}),
  btn:(v,go,cls)=>({isBtn:1,v,go,cls:cls||''}),
  chk:(on,go)=>({isChk:1,on:on?'on':'',go}),
  more:()=>({isMore:1,al:'rt'}),
};
const H = (l, r) => ({l, al: r ? 'rt' : ''});
const noop = () => {};
const SEV = {bad:3, warn:2, info:1, ok:0};

function qualOf(d) {
  let w = -1, wi = 0;
  d.q.forEach(([k], i) => { if (SEV[k] > w) { w = SEV[k]; wi = i; } });
  const [k, t] = d.q[wi];
  if (k === 'ok') return {k:'ok', v:'Qualified'};
  return {k, v: QNAMES[wi] + ' · ' + t};
}
function chansOf(d) {
  const out = [];
  if (d.tg) out.push({ic:I.send, k:'info', t:'Telegram linked'});
  if (d.app) out.push({ic:I.mobile, k:'brand', t:'Driver app'});
  if (!out.length) out.push({ic:I.phone, k:'mu', t:'SMS only'});
  return out;
}
function loadOf(name) {
  return LOADS.find(l => l.drv === name && MOVING.includes(l.st)) || LOADS.find(l => l.drv === name && l.st === 'assigned') || LOADS.find(l => l.drv === name && l.st === 'hold');
}

// ---------------------------------------------------------------- generic list screens
function buildList(screen, X) {
  const {fin, c, user, team} = X;
  const A = (l, cls, ic, go) => ({l, cls:cls||'', ic:ic||'', go:go||noop});
  const tabs = arr => arr.map(([l, n], i) => ({l, n:n||'', on: i === 0 ? 'on' : ''}));
  const base = {tabs:null, kpis:null, kpiN:4, band:null, callout:null, chips:[], adds:[], hidden:''};

  if (screen === 'customers') {
    const cols = 'minmax(0,1.5fr) 128px minmax(0,1fr) 72px 84px' + (fin ? ' 112px' : '') + ' 76px 28px';
    const head = [H('Customer'),H('Status'),H('Primary contact'),H('Terms'),H('Loads · 30 d',1)].concat(fin ? [H('Open balance',1)] : []).concat([H('On time',1),H('')]);
    const rows = CUSTOMERS.map(([n,code,st,k,ct,terms,loads,bal,ot]) => ({cls: st === 'Archived' ? 'dim' : '', open:noop, cells:
      [T.tx(n, code, 'w5'), T.b(st,k), T.tx(ct, ct === '—' ? '' : 'Operations'), T.tx(terms,'','t3'), T.n(loads)]
      .concat(fin ? [T.m(fm(bal))] : []).concat([T.n(ot), T.more()])}));
    return {...base, group:'Directory', title:'Customers', sub:'9 customers · operational and billing contacts are kept separate', ph:'Name, code or contact',
      actions:[A('Import','', I.upload), A('New customer','pri', I.plus)], tabs:tabs([['Active','7'],['Credit review','1'],['Archived','1'],['All','9']]),
      chips:[], adds:['Status','Terms'], hidden: fin ? '' : 'Balances hidden for your role', cols, head, rows, foot:'Showing 1–9 of 9'};
  }

  if (screen === 'drivers') {
    const cols = 'minmax(0,1.35fr) 112px 84px minmax(0,1.15fr) 72px 96px 60px 28px';
    const head = [H('Driver'),H('Status'),H('CDL'),H('Qualification'),H('Truck'),H('Current load'),H('Channels'),H('')];
    const rows = DRIVERS.filter(d => inTeam(team, d.t)).map(d => {
      const q = qualOf(d), l = loadOf(d.n), pres = d.sk === 'ok' ? 'ok' : (d.sk === 'mu' ? 'mu' : 'brand');
      return {cls: d.st === 'Inactive' ? 'dim' : '', open: () => c.driver(d.n), cells:[
        T.p(d.n, d.i, d.ph, pres), T.b(d.st, d.sk), T.tx(d.cdl,'','mono fs12 t3'),
        T.dots(q.v, d.q.map(x => x[0]), q.k), T.tx(d.t === '—' ? '—' : 'T-' + d.t,'','mono t2'),
        l ? T.id(l.id, '', () => c.open(l.id)) : T.tx('—','','mu'), T.ch(chansOf(d)), T.more()]};
    });
    return {...base, group:'Directory', title:'Drivers', sub: team ? team.name + ' · 14 drivers on the team’s trucks · license numbers and birth dates never appear in lists' : '42 drivers · license numbers and birth dates never appear in lists', ph:'Name, phone or truck',
      actions:[A('Import','', I.sheet, () => c.imp('driver')), A('Invite to app','', I.mobile), A('Add driver','pri', I.plus, () => c.add('driver'))], tabs:tabs(team ? [['All','14'],['Available','3'],['On a load','9'],['Not dispatchable','1']] : [['All','42'],['Available','9'],['On a load','29'],['Not dispatchable','3'],['Inactive','1']]),
      chips:[], adds:['Qualification','Channel'], cols, head, rows, foot: team ? 'Showing 6 of 14' : 'Showing 1–12 of 42'};
  }

  if (screen === 'trucks') {
    const cols = '72px minmax(0,1.25fr) 104px 124px 84px 92px minmax(0,1.1fr) 96px 28px';
    const head = [H('Unit'),H('Make · model'),H('Plate'),H('Status'),H('Odometer',1),H('Assignment'),H('Next service'),H('Telematics'),H('')];
    const rows = TRUCKS.filter(x => inTeam(team, x[0])).map(([u,mm,pl,st,k,,odo,asg,nx,nk,tel]) => ({open:noop, cells:[
      T.tx(u,'','mono w5'), T.tx(mm), T.tx(pl,'','mono fs12 t3'), T.b(st,k), T.n(odo),
      asg === '—' ? T.tx('—','','mu') : T.id(asg,'',() => c.open(asg)), T.rk(nx, nk, I.wrench),
      T.rk(tel, tel === 'Live' ? 'ok' : (tel.indexOf('Stale') === 0 ? 'warn' : 'bad'), I.pin), T.more()]}));
    return {...base, group:'Safety & fleet', title:'Trucks', sub:(team ? team.name + ' · 14 trucks' : '41 trucks') + ' · trucks out of service or in the shop can’t be dispatched', ph:'Unit, VIN or plate',
      actions:[A('Import','', I.sheet, () => c.imp('truck')), A('Add truck','pri', I.plus, () => c.add('truck'))], tabs:tabs(team ? [['All','14'],['Available','4'],['On a load','9'],['In the shop','1']] : [['All','41'],['Available','6'],['On a load','31'],['In the shop','3'],['Out of service','1']]),
      adds:['Status','Make'], cols, head, rows, foot: team ? 'Showing 6 of 14' : 'Showing 1–12 of 41'};
  }

  if (screen === 'trailers') {
    const TR = [
      ['TR-5259','53’ dry van','Utility 4000D-X · 2021','TX · 1XJ 2259','Loaded','assigned','T-1102','FF-24866','Inspection in 4 mo','mu','Live'],
      ['TR-5264','53’ dry van','Wabash DuraPlate · 2022','TX · 1XJ 5264','Empty','ok','T-1117','—','Inspection in 7 mo','mu','Live'],
      ['TR-5276','53’ dry van','Great Dane Champion · 2020','TX · 1XH 5276','At pickup','atpickup','T-1133','FF-24828','Brake check in 9 d','warn','Live'],
      ['TR-5288','53’ dry van','Utility 4000D-X · 2023','TX · 1XK 5288','Loaded','assigned','T-1142','FF-24801','Inspection in 10 mo','mu','Live'],
      ['TR-5290','53’ dry van','Wabash DuraPlate · 2021','TX · 1XH 5290','On hold','hold','T-1129','FF-24833','Inspection in 2 mo','mu','Live'],
      ['TR-5301','53’ reefer','Utility 3000R · 2022','TX · 1XJ 5301','Loaded','assigned','T-1121','FF-24839','Reefer alarm code 22','bad','Live · 34°F'],
      ['TR-5302','53’ reefer','Great Dane Everest · 2021','TX · 1XH 5302','Empty','ok','—','—','Reefer service 120 h','warn','Live · unit off'],
      ['TR-5307','53’ dry van','Wabash DuraPlate · 2019','TX · 1XG 5307','In the shop','warn','—','—','Registration in 23 d','warn','No signal'],
      ['TR-5312','53’ dry van','Utility 4000D-X · 2022','TX · 1XJ 5312','Loaded','assigned','T-1108','FF-24817','Inspection in 6 mo','mu','Live'],
      ['TR-5317','53’ dry van','Hyundai Translead · 2023','TX · 1XK 5317','Empty','ok','T-1149','—','Inspection in 11 mo','mu','Stale 47 m'],
      ['TR-5319','53’ dry van','Utility 4000D-X · 2023','TX · 1XK 5319','Loaded','assigned','T-1155','FF-24846','Inspection in 9 mo','mu','Live'],
      ['TR-5340','48’ flatbed','Fontaine Infinity · 2020','TX · 1XG 5340','Empty','ok','—','—','Tarp & strap check','warn','No tracker'],
    ];
    const cols = '84px 104px minmax(0,1.25fr) 112px 112px 76px 92px minmax(0,1.1fr) 112px 28px';
    const head = [H('Unit'),H('Type'),H('Make · year'),H('Plate'),H('Status'),H('Truck'),H('Load'),H('Next service'),H('Tracking'),H('')];
    const rows = TR.map(([u,ty,mm,pl,st,k,trk,ld,nx,nk,tel]) => ({open:noop, cells:[
      T.tx(u,'','mono w5'), T.tx(ty,'','t2'), T.tx(mm), T.tx(pl,'','mono fs12 t3'), T.b(st,k), T.tx(trk,'', trk === '—' ? 'mu' : 'mono fs12 t2'),
      ld === '—' ? T.tx('—','','mu') : T.id(ld,'',() => c.open(ld)), T.rk(nx, nk, I.wrench),
      T.rk(tel, tel.indexOf('Live') === 0 ? 'ok' : (tel.indexOf('Stale') === 0 ? 'warn' : 'bad'), I.pin), T.more()]}));
    return {...base, group:'Safety & fleet', title:'Trailers', sub:'64 trailers · 46 dry vans, 14 reefers, 4 flatbeds · trailers in the shop can’t be dispatched', ph:'Unit, VIN or plate',
      actions:[A('Import','', I.sheet, () => c.imp('trailer')), A('Add trailer','pri', I.plus, () => c.add('trailer'))], tabs:tabs([['All','64'],['Loaded','44'],['Empty','18'],['In the shop','2']]),
      adds:['Type','Status'], cols, head, rows, foot:'Showing 1–12 of 64'};
  }

  if (screen === 'documents') {
    const D = [
      ['POD-FF-24782.pdf','Proof of delivery','FF-24782','Driver app scan','2','ok','94%','ok','Nov 12 · 11:42','Needs review','info',1],
      ['MED-K-Nguyen.jpg','Medical certificate','Kara Nguyen','Driver app scan','1','ok','96%','ok','Today · 09:12','Needs review','info',0],
      ['REG-TR5307.pdf','Registration','TR-5307','Upload · Rosa D.','1','ok','91%','ok','Nov 12 · 16:40','Needs review','info',0],
      ['COI-2027.pdf','Certificate of insurance','Lone Star Freight','Email inbox','4','ok','88%','warn','Nov 11 · 15:02','Needs review','info',0],
      ['RC-FF-24873.pdf','Rate confirmation','FF-24873','Email inbox','2','ok','','','Today · 11:19','Processing','violet',0],
      ['IMG_2231.HEIC','Unclassified','—','Driver app','1','scan','','','Today · 11:20','Processing','violet',0],
      ['LUMPER-FF-24801.jpg','Lumper receipt','FF-24801','Driver app scan','1','ok','31%','bad','Today · 10:58','Failed · unreadable','bad',0],
      ['BOL-FF-24839.jpg','Bill of lading','FF-24839','Driver app scan','1','ok','95%','ok','Today · 09:41','Approved','ok',0],
      ['BOL-FF-24846.jpg','Bill of lading','FF-24846','Driver app scan','1','ok','97%','ok','Today · 07:31','Approved','ok',0],
      ['INSP-T1121-2025.pdf','Annual inspection','T-1121','Upload · Owen B.','2','ok','93%','ok','Nov 1 · 10:15','Approved','ok',0],
    ];
    const cols = 'minmax(0,1.35fr) 132px 112px 124px 52px 96px 116px 104px 128px';
    const head = [H('Document'),H('Type'),H('Linked to'),H('Source'),H('Pages',1),H('Malware scan'),H('OCR confidence'),H('Uploaded'),H('State')];
    const rows = D.map(([f,t,lk,src,pg,scan,ocr,ok,up,st,k,rev]) => ({open: () => c.go('docreview'), cls: rev ? 'sel' : '', cells:[
      T.tx(f,'','mono fs12 w5'), T.tx(t,'','t2'), T.tx(lk,'', lk.indexOf('FF-') === 0 || lk.indexOf('T') === 0 ? 'mono fs12' : ''), T.tx(src,'','t3'), T.n(pg),
      scan === 'ok' ? T.rk('Passed','ok',I.shield) : T.rk('Scanning…','info',I.clock),
      ocr ? T.bar(ocr, ocr, ok) : T.tx('—','','mu'), T.tx(up,'','num t3'), T.b(st,k)]}));
    return {...base, group:'Safety & fleet', title:'Documents', sub:'BOLs, PODs, licenses, insurance and inspections · private storage · scanned before anyone opens them', ph:'File name, load or person',
      actions:[A('Scan with phone','', I.camera), A('Upload','pri', I.upload)], tabs:tabs([['Needs review','4'],['Processing','2'],['Failed','1'],['Approved',''],['Rejected',''],['All','']]),
      adds:['Type','Linked to','Uploaded by'], cols, head, rows, foot:'Showing 1–10 of 1,906'};
  }

  if (screen === 'invoices') {
    const cols = '96px minmax(0,1.3fr) 52px 70px 70px 104px 104px 124px minmax(0,1fr) 28px';
    const head = [H('Invoice'),H('Customer'),H('Loads',1),H('Issued'),H('Due'),H('Amount',1),H('Balance',1),H('Status'),H('Notes'),H('')];
    const rows = INVOICES.map(([id,cu,ld,is,du,amt,bal,st,k,note]) => ({cls: st === 'Void' ? 'dim' : '', open:noop, cells:[
      T.tx(id,'','mono w5'), T.tx(cu), T.n(ld), T.tx(is,'','num t3'), T.tx(du,'','num t3'), T.m(fm2(amt)), T.m(fm2(bal),'', bal ? '' : 'mu'), T.b(st,k), T.tx(note,'', k === 'bad' ? 'tc' : 't3'), T.more()]}));
    rows.forEach(r => { if (r.cells[7].k === 'bad') r.cells[8] = {...r.cells[8], cls:'w5', scls:''}; });
    return {...base, group:'Finance', title:'Invoices', sub:'Issued invoices are immutable — corrections use credit notes, or void and reissue', ph:'Invoice #, customer or load',
      actions:[A('Record payment','', I.dollar), A('New invoice','pri', I.plus, () => c.add('invoice'))], tabs:tabs([['All open','31'],['Ready to invoice','23'],['Drafts','4'],['Overdue','14'],['Paid',''],['Void','']]),
      kpis:[
        {label:'Invoiced · Nov 1–13', value:'$184,220', suffix:'', sub:'38 invoices issued', k:'brand', sk:'mu'},
        {label:'Cash received · Nov 1–13', value:'$151,940', suffix:'', sub:'41 payments applied', k:'ok', sk:'mu'},
        {label:'Delivered, not invoiced', value:'$38,610', suffix:'', sub:'Estimate · 23 loads ready, 2 blocked', k:'warn', sk:'warn'},
      ], kpiN:3,
      band:{title:'Open receivables by age', sub:'as of Nov 13 · invoice due date', total:'$110.6k', segs:[
        {l:'Current',v:'$62.4k',k:'ok',w:'56.4%'},{l:'1–30 days',v:'$31.8k',k:'warn',w:'28.8%'},{l:'31–60 days',v:'$12.6k',k:'late',w:'11.4%'},{l:'61–90 days',v:'$3.1k',k:'bad',w:'2.8%'},{l:'90+ days',v:'$0.7k',k:'bad',w:'0.6%'}]},
      adds:['Customer','Status','Due date'], cols, head, rows, foot:'Showing 1–12 of 54'};
  }

  if (screen === 'settlements') {
    const cols = 'minmax(0,1.15fr) 52px minmax(0,1.3fr) 100px 104px 84px 104px 108px 92px';
    const head = [H('Driver'),H('Loads',1),H('Pay basis'),H('Gross',1),H('Deductions',1),H('Adjust.',1),H('Net pay',1),H('Status'),H('')];
    let g = 0, dd = 0, aj = 0;
    const rows = SETTLEMENTS.map(([n,i,ld,basis,qty,gross,ded,adj,st,k]) => { g += gross; dd += ded; aj += adj;
      const act = st === 'In review' ? 'Approve' : (st === 'Draft' ? 'Review' : 'View');
      return {open:noop, cells:[T.p(n,i,'Nov 2–8'), T.n(ld), T.tx(basis, qty, 't2'), T.m(fm2(gross)), T.m(fm2(ded),'','t3'), T.m(adj ? '+' + fm2(adj) : '—','', adj ? '' : 'mu'),
        T.m(fm2(gross + ded + adj),'','w6'), T.b(st,k), T.btn(act, noop, act === 'Approve' ? 'pri' : '')]}; });
    return {...base, group:'Finance', title:'Driver statements', sub:'Weekly pay statements · every line traces to a load or a dated adjustment', ph:'Driver or load',
      actions:[A('Export pay file','', I.download), A('Run statements','pri', I.play)], tabs:tabs([['Nov 2 – 8','10'],['Oct 26 – Nov 1','10'],['Oct 19 – 25','9']]),
      kpis:[
        {label:'Gross pay', value:fm2(g), suffix:'', sub:'50 loads · 10 drivers', k:'brand', sk:'mu'},
        {label:'Deductions', value:fm2(dd), suffix:'', sub:'Fuel advances, escrow, insurance', k:'mu', sk:'mu'},
        {label:'Adjustments', value:'+' + fm2(aj), suffix:'', sub:'Detention and layover pay', k:'ok', sk:'mu'},
        {label:'Net to pay', value:fm2(g + dd + aj), suffix:'', sub:'2 approved · 3 in review · 5 draft', k:'info', sk:'mu'},
      ], kpiN:4,
      callout:{k:'info', t:'Approved statements are locked', d:'Changes after approval are added as dated adjustments with a reason. Totals are never recalculated silently when rates change.', b:''},
      adds:['Status','Pay basis'], cols, head, rows, foot:'10 drivers · pay period Nov 2 – 8'};
  }

  if (screen === 'inspections') {
    const R = [
      ['Nov 12','TX-26-0417','Hillsboro, TX','I','Jamal Carter','JC','T-1121 · TR-5301',3,'Tire, brake, lamp','oos',20,'Needs review','info'],
      ['Nov 9','OK-26-1182','Ardmore, OK','II','Ana Ruiz','AR','T-1108 · TR-5312',0,'','clean',0,'Reviewed','ok'],
      ['Nov 4','TX-26-0391','Waco, TX','III','Sam Whitfield','SW','T-1102',1,'Medical card not in possession','viol',1,'Reviewed','ok'],
      ['Oct 28','LA-26-2210','Shreveport, LA','I','Marcus Bell','MB','T-1142 · TR-5288',0,'','clean',0,'Reviewed','ok'],
      ['Oct 21','TX-26-0355','Dallas, TX','II','Priya Shah','PS','T-1155 · TR-5319',2,'Lamps','viol',12,'Repairs certified','ok'],
      ['Oct 15','AR-26-0871','Texarkana, AR','I','Luis Ortega','LO','T-1133 · TR-5276',1,'Brake hose chafed','oos',9,'Repairs certified','ok'],
      ['Oct 2','TX-26-0329','Abilene, TX','III','Kara Nguyen','KN','T-1160',0,'','clean',0,'Reviewed','ok'],
      ['Sep 24','OK-26-1049','Oklahoma City, OK','II','Ben Okafor','BO','T-1117 · TR-5264',1,'Tire tread depth','viol',8,'DataQs filed','violet'],
      ['Sep 18','TX-26-0302','Dallas, TX','V','—','','T-1163',0,'','clean',0,'Reviewed','ok'],
      ['Sep 9','TX-26-0288','Fort Worth, TX','I','Tom Reyes','TR','T-1129 · TR-5290',2,'Brakes, wheel fastener','oos',17,'Repairs certified','ok'],
    ];
    const RES = {oos:['Out of service','bad'], viol:['Violations','warn'], clean:['Clean','ok']};
    const cols = '60px minmax(0,0.95fr) 64px minmax(0,1fr) 124px minmax(0,1.2fr) 116px 52px 124px';
    const head = [H('Date'),H('Report'),H('Level'),H('Driver'),H('Units'),H('Violations'),H('Result'),H('Points',1),H('Status')];
    const rows = R.map(([d,id,city,lvl,drv,ini,units,n,what,res,pts,st,k], i) => ({open: i === 0 ? () => c.inspect() : noop, cls: i === 0 ? 'sel' : '', cells:[
      T.tx(d,'','num t2'), T.tx(id, city, 'mono fs12 w5'), T.tx('Level ' + lvl,'','t2'), drv === '—' ? T.tx('Yard inspection','','mu') : T.p(drv, ini), T.tx(units,'','mono fs12 t2'),
      n ? T.tx(n + (n > 1 ? ' violations' : ' violation'), what) : T.tx('None','','mu'), T.b(RES[res][0], RES[res][1]), T.n(pts ? String(pts) : '—'), T.b(st, k)]}));
    return {...base, group:'Safety & fleet', title:'Inspections', sub:'Roadside inspections and violations · scanned reports are matched to FMCSA records every month · 24-month window', ph:'Report, driver, truck or code',
      actions:[A('Sync FMCSA','', I.refresh), A('Add inspection','pri', I.plus, () => c.add('inspection'))], tabs:tabs([['All','86'],['Needs review','2'],['Out of service','10'],['With violations','41'],['Clean','45'],['DataQs','1']]),
      kpis:[
        {label:'Inspections · 24 months', value:'86', suffix:'', sub:'45 clean · 41 with violations', k:'brand', sk:'mu'},
        {label:'Vehicle out-of-service rate', value:'14.3', suffix:'%', sub:'10 of 70 · below national avg', k:'warn', sk:'mu'},
        {label:'Driver out-of-service rate', value:'2.4', suffix:'%', sub:'2 of 82 · below national avg', k:'ok', sk:'mu'},
        {label:'Vehicle Maintenance BASIC', value:'61', suffix:'%', sub:'Alert at 80% · up 3 since September', k:'warn', sk:'warn'},
        {label:'Waiting for review', value:'2', suffix:'', sub:'Scanned in the driver app', k:'info', sk:'mu'},
      ], kpiN:5,
      callout:{k:'bad', ic:I.alert, t:'TX-26-0417 needs review: a trailer was put out of service', d:'3 violations read from Jamal Carter’s photos, 20 severity points. Repairs have to be certified on the report by Nov 27.', b:'Review report', go:() => c.inspect()},
      chips:[], adds:['Level','Result','Unit'], cols, head, rows, foot:'Showing 1–10 of 86'};
  }

  if (screen === 'audit') {
    const cols = '82px minmax(0,1.15fr) minmax(0,1.2fr) minmax(0,1.1fr) 112px 104px';
    const head = [H('Time'),H('Actor'),H('Action'),H('Entity'),H('Request ID'),H('Source')];
    const E = [
      ['11:20:03','System','SY','Telematics webhook','fleet_alert.created','SPD-0412 · T-1121','req_8f2c19','Webhook'],
      ['11:18:41','Ana Ruiz','AR','Driver','load.eta_reported','FF-24817','req_77ab02','Driver app'],
      ['11:12:05','Dana Kim','DK','Main Admin','role.permissions.updated','Role · Dispatcher','req_5d1e88','Web', {title:'Before → after', meta:'role v12 → v13 · reason required', lines:[{k:'fleet_alerts.assign',a:'false',b:'true'},{k:'loads.export',a:'true',b:'false'},{k:'reason',a:'—',b:'Night shift acknowledges speeding'}]}],
      ['10:58:10','System','SY','Document worker','document.scan_failed','LUMPER-FF-24801.jpg','req_31aa90','Worker'],
      ['10:41:37','Alex Rivera','AR','Dispatcher','dispatch.assignment.created','FF-24870 → Kara Nguyen','req_29c4d1','Web'],
      ['10:12:00','FlyFleet Support','FS','Support · ends 12:12','support_session.started','Approved by Dana Kim','req_0f81e5','Platform'],
      ['09:47:22','Mei Chen','MC','Accounting','invoice.issued','INV-10511','req_c2f077','Web'],
      ['09:02:16','Jordan Lee','JL','Dispatcher','load.transition','FF-24839 · Assigned → Dispatched','req_a91b3c','Web'],
      ['08:55:40','Rosa Delgado','RD','Safety Manager','document.approved','BOL-FF-24846','req_d44e10','Web'],
      ['08:30:02','Dana Kim','DK','Main Admin','session.mfa_verified','—','req_e10b55','Web'],
    ];
    const rows = E.map(([t,who,i,role,act,ent,req,src,x]) => ({open:noop, x: x || null, cls: x ? 'sel' : '', cells:[
      T.tx(t,'','mono fs12 t3'), T.p(who,i,role, who === 'FlyFleet Support' ? 'warn' : ''), T.tx(act,'','mono fs12 w5'), T.tx(ent,'','t2'), T.tx(req,'','mono fs12 mu'),
      who === 'FlyFleet Support' ? T.tags([{v:'Support',k:'warn'}]) : T.tx(src,'','t3')]}));
    return {...base, group:'Administration', title:'Audit log', sub:'Append-only · before/after values only for roles with audit.read · secrets and IDs are redacted', ph:'Actor, action, entity or request ID',
      actions:[A('Export','', I.download)], tabs:tabs([['All events',''],['Security',''],['Permissions','2'],['Loads & dispatch',''],['Finance',''],['Platform support','1']]),
      chips:['Last 24 hours'], adds:['Actor','Action','Entity'], cols, head, rows, foot:'Showing 10 of 2,418 events today'};
  }

  if (screen === 'tasks') {
    const cols = '28px minmax(0,1.7fr) 92px 96px 104px 108px';
    const head = [H(''),H('Task'),H('Due'),H('Priority'),H('Linked'),H('')];
    const K = [
      ['Assign a driver to FF-24851','Pickup 14:00 in Waxahachie · suggested: Ben Okafor','13:00','High','bad','FF-24851','Assign',() => c.assign()],
      ['Tell Walmart about the FF-24817 delay','ETA 16:40 vs 15:00 appointment · draft ready','Now','High','bad','FF-24817','Notify',() => c.open('FF-24817')],
      ['Acknowledge speeding incident SPD-0412','T-1121 · Jamal Carter · 76 mph peak','Now','High','bad','T-1121','Open',() => c.go('tracking')],
      ['Request POD for FF-24790','Delivered Nov 12 · invoicing blocked','Today','Medium','warn','FF-24790','Request',() => c.open('FF-24790')],
      ['Watch detention at GP Irving Mill','Luis Ortega at pickup since 10:24','12:24','Medium','warn','FF-24828','Open',() => c.open('FF-24828')],
      ['Attach rate confirmation to FF-24862','Draft · Sysco North Texas','Today','Low','mu','FF-24862','Open',() => c.open('FF-24862')],
    ];
    const rows = K.map(([t,s,due,pr,k,lk,act,go]) => ({open:go, cells:[T.chk(false, noop), T.tx(t, s, 'w5'), T.tx(due,'','num t2'), T.b(pr,k), T.tx(lk,'','mono fs12 t2'), T.btn(act, go)]}));
    return {...base, group:'Overview', title:'My tasks', sub:'Created from exceptions and by teammates · ' + user.name + '’s queue', ph:'Search tasks',
      actions:[A('New task','pri', I.plus)], tabs:tabs([['Open','6'],['Due today','5'],['Assigned by me',''],['Done','']]), cols, head, rows, foot:'6 open tasks'};
  }

  if (screen === 'alerts') {
    const cols = '112px minmax(0,1.45fr) minmax(0,1fr) 88px 66px 120px 104px';
    const head = [H('Type'),H('Incident'),H('Truck · driver'),H('Load'),H('Detected'),H('State'),H('')];
    const R = [
      ['Speeding','bad','Above 73 mph for 6 min','Peak 76 mph · I-35 S near Temple · SPD-0412','T-1121','Jamal Carter','FF-24839','11:16','Notified','warn','Acknowledge',() => c.go('tracking')],
      ['At risk','bad','Will miss the 15:00 appointment','ETA 16:40 · Walmart DC 6094','T-1108','Ana Ruiz','FF-24817','11:18','Open','bad','Review',() => c.open('FF-24817')],
      ['Unassigned','warn','Pickup in 2h 40m with no driver','Owens Corning · Waxahachie','—','','FF-24851','11:02','Open','bad','Assign',() => c.assign()],
      ['Late','late','ETA 35 min past appointment','Sysco Central Texas · appt 15:30','T-1121','Jamal Carter','FF-24839','11:05','Acknowledged','info','Open',() => c.open('FF-24839')],
      ['POD missing','bad','Delivered yesterday, no POD','Kimberly-Clark · Memphis','T-1117','Ben Okafor','FF-24790','Nov 12','Notified','warn','Request',() => c.open('FF-24790')],
      ['GPS stale','warn','No position for 47 min','Last seen Dallas yard 10:33','T-1149','Devon Price','—','10:33','Open','bad','Check',() => c.go('tracking')],
      ['Dwell','info','At pickup for 56 min','GP Irving Mill · detention starts at 2 h','T-1133','Luis Ortega','FF-24828','10:24','Watching','mu','Open',() => c.open('FF-24828')],
      ['Speeding','late','Above 73 mph for 2 min','Peak 74 mph · US-75 N · SPD-0409','T-1155','Priya Shah','FF-24846','08:12','Acknowledged','info','View',() => c.go('tracking')],
      ['Out of service','bad','Turbo actuator · waiting on parts','WO-1170 · part ETA Nov 17','T-1138','Leah Morgan','—','Nov 11','Acknowledged','info','Open',() => c.go('maintenance')],
    ];
    const rows = R.filter(x => x[4] === '—' ? (!team || team.tags.includes(x[6])) : inTeam(team, x[4])).map(([ty,tk,t,s,unit,drv,ld,det,st,sk,act,go]) => ({open:go, cells:[
      T.b(ty,tk), T.tx(t,s,'w5'), T.tx(unit, drv, 'mono fs12 w5'), ld === '—' ? T.tx('—','','mu') : T.id(ld,'',go), T.tx(det,'','num t3'), T.b(st,sk), T.btn(act, go, act === 'Acknowledge' ? 'pri' : '')]}));
    return {...base, group:'Operations', title:'Fleet alerts', sub:'One incident per episode, each with an owner and a trail — never one alert per GPS sample', ph:'Truck, driver, load or incident',
      actions:[A('Alert policies','', I.sliders, () => c.go('policy'))], tabs:tabs([['Open','9'],['Speeding','2'],['Late & at risk','3'],['Documents','1'],['Equipment','2'],['Resolved','']]),
      chips:[], adds:['Type','Owner'], cols, head, rows, foot: team ? '7 open incidents on Team A trucks · 3 high severity' : '9 open incidents · 3 high severity'};
  }

  if (screen === 'platform') {
    const cols = 'minmax(0,1.3fr) 76px 110px 64px 60px 96px 104px minmax(0,1.4fr)';
    const head = [H('Organization'),H('Plan'),H('Status'),H('Trucks',1),H('Users',1),H('Region'),H('Isolation tests'),H('Support access')];
    const P = [
      ['Lone Star Freight','LS','MC 884213 · since Nov 2','Pilot','Active','ok','41','12','us-east-1','Session active · ends 12:12 · approved by Dana Kim','warn'],
      ['Red River Logistics','RR','MC 902117 · since Nov 6','Pilot','Active','ok','18','6','us-east-1','None','mu'],
      ['Keystone Haulers','KH','MC 915540 · invited Nov 12','Trial','Onboarding','info','9','3','us-east-1','None','mu'],
    ];
    const rows = P.map(([n,i,s,plan,st,k,tr,us,reg,sup,sk]) => ({open:noop, cells:[T.p(n,i,s), T.tx(plan,'','t2'), T.b(st,k), T.n(tr), T.n(us), T.tx(reg,'','mono fs12 t3'), T.rk('Passing','ok',I.shield), T.tx(sup,'', sk === 'warn' ? 'tc w5' : 't3')]}));
    rows[0].cells[7] = {...rows[0].cells[7], cls:'w5'};
    return {...base, group:'Platform', title:'Organizations', sub:'FlyFleet SaaS · one tenant per carrier · data isolated in the API and the database', ph:'Organization or MC number',
      actions:[A('Provision tenant','pri', I.plus)],
      kpis:[
        {label:'Tenants', value:'3', suffix:'', sub:'2 pilots · 1 onboarding', k:'brand', sk:'mu'},
        {label:'Trucks managed', value:'68', suffix:'', sub:'across all tenants', k:'mu', sk:'mu'},
        {label:'Active users', value:'21', suffix:'', sub:'MFA on for every admin', k:'ok', sk:'mu'},
        {label:'Support sessions', value:'1', suffix:'', sub:'Lone Star Freight · ends 12:12', k:'warn', sk:'warn'},
      ], kpiN:4,
      callout:{k:'info', t:'Support access is visible, time-limited and audited', d:'Platform staff see a tenant only after its Main Admin approves a session. Every action is marked “Support” in that tenant’s audit log.', b:''},
      cols, head, rows, foot:'3 organizations'};
  }
  return null;
}

// ---------------------------------------------------------------- dashboard (role-aware)
function availWidget(team) {
  const rows = (team ? [
    {label:'Drivers', total:14, segs:[['On a load',9,'brand'],['Available',3,'ok'],['Off today',2,'off']]},
    {label:'Trucks', total:14, segs:[['Active',9,'brand'],['Available',4,'ok'],['In shop',1,'warn']]},
  ] : [
    {label:'Drivers', total:42, segs:[['On a load',29,'brand'],['Available',9,'ok'],['Off today',4,'off']]},
    {label:'Trucks', total:41, segs:[['Active',31,'brand'],['Available',6,'ok'],['In shop',3,'warn'],['Out of service',1,'bad']]},
    {label:'Trailers', total:64, segs:[['Loaded',44,'brand'],['Empty',18,'ok'],['In shop',2,'warn']]},
  ]).map(f => ({...f, segs: f.segs.map(([l,n,k]) => ({l, n:String(n), k, w:(n / f.total * 100).toFixed(2) + '%'}))}));
  return {title: team ? team.name + ' availability' : 'Fleet availability', note:'Live', isAvail:1, rows};
}
function moneyWidget() {
  return {title:'Money this month', note:'Nov 1–13', isMoney:1, items:[
    {label:'Invoiced', v:'$184.2k', s:'38 invoices issued', k:'brand'},
    {label:'Cash received', v:'$151.9k', s:'41 payments applied', k:'ok'},
    {label:'Not yet billed', v:'$38.6k', s:'estimate · 23 loads', k:'warn'}],
    foot:'Three numbers on purpose — estimates, invoices and cash are never added together.'};
}
function expWidget(c) {
  return {title:'Expiring in 30 days', link:'Compliance', go:() => c.go('safety'), isList:1, items:[
    {a:'Medical certificate', b:'Marcus Bell · driver', chip:'6 days', k:'bad'},
    {a:'Annual inspection', b:'T-1121 · truck', chip:'11 days', k:'warn'},
    {a:'MVR annual review', b:'Devon Price · driver', chip:'12 days', k:'warn'},
    {a:'CDL renewal', b:'Ana Ruiz · driver', chip:'19 days', k:'warn'},
    {a:'Registration', b:'TR-5307 · trailer', chip:'23 days', k:'mu'}]};
}
function liveWidget(c, team) {
  if (team) return {title:'Live fleet · ' + team.name, link:'Open map', go:() => c.go('tracking'), isList:1, items:[
    {a:'Moving', b:'Vehicle-reported speed, updated 11:20', chip:'8', k:'brand'},
    {a:'Stopped or idle', b:'Customers, yards and the shop', chip:'4', k:'mu'},
    {a:'Speeding now', b:'T-1121 · Highway sustained policy', chip:'1', k:'bad'},
    {a:'Stale or no signal', b:'T-1149', chip:'1', k:'warn'}]};
  return {title:'Live fleet', link:'Open map', go:() => c.go('tracking'), isList:1, items:[
    {a:'Moving', b:'Vehicle-reported speed, updated 11:20', chip:'18', k:'brand'},
    {a:'Stopped or idle', b:'Customers, yards and the shop', chip:'20', k:'mu'},
    {a:'Speeding now', b:'T-1121 · Highway sustained policy', chip:'1', k:'bad'},
    {a:'Stale or no signal', b:'T-1149, T-1138, T-1171', chip:'3', k:'warn'}]};
}
function buildDash(X) {
  const {fin, roleKey, R, c, team} = X;
  const can = m => !R.deny.includes(m);
  const sub = 'Friday, Nov 13 · updated 11:20 CT';
  if (roleKey === 'accounting') {
    const R = [['FF-24775','Owens Corning','Nov 11','Approved','ok',2980,'Create draft'],['FF-24744','Walmart Transportation','Nov 10','Approved','ok',1410,'Create draft'],['FF-24752','PepsiCo Logistics','Nov 10','Approved','ok',1760,'Create draft'],['FF-24761','Home Depot Supply','Nov 11','Approved','ok',1320,'Create draft'],['FF-24782','Home Depot Supply','Nov 12','In review','info',1040,'Review POD'],['FF-24790','Kimberly-Clark','Nov 12','Missing','bad',2240,'Request POD']];
    const t = {title:'Ready to invoice', sub:'Delivered, with a reviewed POD', link:'Invoices', go:() => c.go('invoices'),
      cols:'92px minmax(0,1.2fr) 76px 112px 108px 108px', head:[H('Load'),H('Customer'),H('Delivered'),H('POD'),H('Est. amount',1),H('')],
      rows:R.map(([id,cu,d,pod,k,amt,act]) => ({open:() => c.open(id), cells:[T.id(id,'',() => c.open(id)), T.tx(cu), T.tx(d,'','num t3'), T.b(pod,k), T.m(fm2(amt)), T.btn(act, act === 'Review POD' ? () => c.go('docreview') : noop, act === 'Create draft' ? '' : 'pri')]}))};
    return {title:'Billing overview', sub, canCreate:false, t, attnN:'5', biz:true,
      kpis:[{label:'Ready to invoice',value:'23',suffix:'',sub:'est. $38.6k',k:'brand',sk:'mu',go:() => c.go('invoices')},{label:'POD review',value:'2',suffix:'',sub:'oldest 1 day',k:'info',sk:'mu',go:() => c.go('documents')},{label:'Draft invoices',value:'4',suffix:'',sub:'$9.4k',k:'mu',sk:'mu',go:() => c.go('invoices')},{label:'Overdue',value:'$48.2k',suffix:'',sub:'14 invoices',k:'bad',sk:'bad',go:() => c.go('invoices')},{label:'Collected · Nov',value:'$151.9k',suffix:'',sub:'41 payments',k:'ok',sk:'mu',go:() => c.go('invoices')},{label:'Statements to approve',value:'3',suffix:'',sub:'Nov 2 – 8',k:'warn',sk:'warn',go:() => c.go('settlements')}],
      attn:[
        {tag:'POD review',k:'info',title:'POD uploaded, needs review',ref:'FF-24782',rc:'mono',meta:'Home Depot Supply · OCR matched the load · 2 fields to check',time:'1d ago',action:'Review',go:() => c.go('docreview')},
        {tag:'POD missing',k:'bad',title:'Can’t invoice — no POD',ref:'FF-24790',rc:'mono',meta:'Kimberly-Clark · delivered Nov 12 · driver asked twice',time:'1d ago',action:'Request',go:() => c.open('FF-24790')},
        {tag:'Overdue',k:'bad',title:'Invoice 12 days past due',ref:'INV-10482',rc:'mono',meta:'Kimberly-Clark · $6,720.00 · customer in credit review',time:'Nov 1',action:'Follow up',go:() => c.go('invoices')},
        {tag:'Approval',k:'warn',title:'Statement waiting for approval',ref:'Ana Ruiz',rc:'',meta:'Nov 2 – 8 · net $1,260.20 · detention adjustment',time:'Today',action:'Review',go:() => c.go('settlements')},
        {tag:'Credit',k:'warn',title:'Customer moved to credit review',ref:'Kimberly-Clark',rc:'',meta:'$14,880 open · new loads need approval',time:'Nov 12',action:'Open',go:() => c.go('customers')}],
      side:[moneyWidget(), {title:'Receivables by age', link:'Aging report', go:() => c.go('reports'), isList:1, items:[{a:'Current',b:'not yet due',chip:'$62.4k',k:'ok'},{a:'1–30 days',b:'11 invoices',chip:'$31.8k',k:'warn'},{a:'31–60 days',b:'2 invoices',chip:'$12.6k',k:'late'},{a:'61–90 days',b:'1 invoice',chip:'$3.1k',k:'bad'},{a:'90+ days',b:'1 invoice',chip:'$0.7k',k:'bad'}]}]};
  }
  const kpis = team ? [
    {label:'Unassigned loads', value:'2', suffix:'', sub:'Both tagged for ' + team.name, k:'warn', sk:'warn', go:() => c.assign()},
    {label:'Late or at risk', value:'2', suffix:'', sub:'1 will miss its appointment', k:'bad', sk:'bad', go:() => c.go('alerts')},
    {label:'Deliveries next 4 h', value:'5', suffix:'', sub:'4 on schedule', k:'info', sk:'mu', go:() => c.go('loads')},
    {label:'Drivers available', value:'3', suffix:' / 14', sub:'Ben Okafor, Devon Price +1', k:'ok', sk:'mu', go:() => c.go('dispatch')},
    {label:'Trucks unavailable', value:'1', suffix:' / 14', sub:'T-1149 · return-to-service check', k:'mu', sk:'mu', go:() => c.go('maintenance')},
    {label:'POD missing', value:'1', suffix:'', sub:'Blocks invoicing', k:'bad', sk:'bad', go:() => c.open('FF-24790')},
  ] : [
    {label:'Unassigned loads', value:'7', suffix:'', sub:'3 pick up today', k:'warn', sk:'warn', go: can('dispatch') ? () => c.assign() : () => c.go('loads')},
    {label:'Late or at risk', value:'3', suffix:'', sub:'1 will miss its appointment', k:'bad', sk:'bad', go:() => c.go('alerts')},
    {label:'Deliveries next 4 h', value:'12', suffix:'', sub:'10 on schedule', k:'info', sk:'mu', go:() => c.go('loads')},
    {label:'Drivers available', value:'9', suffix:' / 42', sub:'2 more free by 15:00', k:'ok', sk:'mu', go:() => c.go('dispatch')},
    {label:'Trucks unavailable', value:'4', suffix:' / 41', sub:'3 in shop · 1 out of service', k:'mu', sk:'mu', go:() => c.go('maintenance')},
    fin ? {label:'Overdue invoices', value:'$48.2k', suffix:'', sub:'14 invoices · oldest 41 days', k:'bad', sk:'mu', go:() => c.go('invoices')}
        : {label:'POD missing', value:'2', suffix:'', sub:'Blocks invoicing', k:'bad', sk:'bad', go:() => c.open('FF-24790')},
  ];
  const attn = [
    {tag:'At risk', k:'bad', mod:'loads', title:'Delivery will miss its appointment', ref:'FF-24817', rc:'mono', meta:'Walmart DC 6094, Oklahoma City · ETA 16:40 vs appt 15:00', time:'2m ago', action:'Review', go:() => c.open('FF-24817')},
    {tag:'Speeding', k:'bad', mod:'tracking', title:'Above 73 mph for 6 min', ref:'T-1121', rc:'mono', meta:'Jamal Carter · I-35 S near Temple · peak 76 mph · not acknowledged', time:'4m ago', action:'Acknowledge', go:() => c.go('tracking')},
    {tag:'Unassigned', k:'warn', mod:'dispatch', title:'Pickup today with no driver', ref:'FF-24851', rc:'mono', meta:'Owens Corning, Waxahachie · pickup 14:00 (in 2h 40m)', time:'18m ago', action:'Assign', go:() => c.assign()},
    {tag:'POD missing', k:'bad', mod:'loads', title:'Delivered yesterday, no POD', ref:'FF-24790', rc:'mono', meta:'Kimberly-Clark, Memphis · invoicing blocked until received', time:'1d ago', action:'Request POD', go:() => c.open('FF-24790')},
    {tag:'Inspection', k:'bad', mod:'inspections', title:'Trailer put out of service at a roadside inspection', ref:'TR-5301', rc:'mono', meta:'Hillsboro, TX · Level I · 3 violations · Jamal Carter’s report needs review', time:'Yesterday', action:'Review', go:() => c.inspect()},
    {tag:'GPS stale', k:'warn', mod:'tracking', title:'No position for 47 min', ref:'T-1149', rc:'mono', meta:'Devon Price · last seen Dallas yard 10:33 · provider retrying', time:'47m ago', action:'Check', go:() => c.go('tracking')},
  ];
  const t = {title:'Deliveries today', sub: team ? '4 of 7 remaining' : '5 of 12 remaining', link:'Open in Loads', go:() => c.go('loads'),
    cols:'88px minmax(0,1.15fr) minmax(0,1fr) 56px 126px minmax(0,0.9fr) 100px',
    head:[H('Load'),H('Customer'),H('Destination'),H('Appt'),H('ETA'),H('Driver'),H('Status')],
    rows:['FF-24846','FF-24801','FF-24817','FF-24839','FF-24828'].filter(id => loadInTeam(team, LOADS.find(x => x.id === id))).map(id => { const l = LOADS.find(x => x.id === id); return {open:() => c.open(id), cells:[
      T.id(id,'',() => c.open(id)), T.tx(l.cust), T.tx(l.del,'','t2'), T.tx(l.delT.split('· ')[1],'','num t3'),
      l.late ? T.rk(l.eta + ' · +' + l.late, l.rk === 'bad' ? 'bad' : 'late') : T.rk(l.eta + ' · on time','ok'),
      T.tx(l.drv,'','t2'), T.b(STL[l.st], l.st)]}; })};
  const owner = roleKey === 'owner';
  const side = [availWidget(team)];
  if (fin) side.push(moneyWidget());
  if (owner) side.push(liveWidget(c), expWidget(c));
  else side.push(roleKey === 'dispatcher' || roleKey === 'fleet' ? liveWidget(c, team) : expWidget(c));
  const shown = attn.filter(a => can(a.mod));
  return {title:'Dashboard', sub: team ? sub + ' · ' + team.name : sub, kpis, attn:shown, attnN:String(shown.length), t, side, canCreate:['owner','ops','dispatcher'].includes(roleKey), biz:fin};
}

// ---------------------------------------------------------------- dispatch board + assignment panel
function buildBoard(X) {
  const {fin, c, panel, team} = X;
  const conflict = panel === 'conflict', open = panel === 'assign' || conflict;
  const pos = (a, b) => { const s = Math.max(a, 6), e = Math.min(b, 22); return {l:((s - 6) / 16 * 100).toFixed(3) + '%', w:((e - s) / 16 * 100).toFixed(3) + '%'}; };
  const rows = BOARD.filter(r => inTeam(team, (DRIVERS.find(x => x.n === r.n) || {}).t)).map(r => {
    const d = DRIVERS.find(x => x.n === r.n);
    const blocks = r.blocks.map(([id, lane, a, b, st, rk]) => ({id, lane, k:st, ...pos(a, b), cls: rk === 'bad' ? 'rk' : (rk === 'late' ? 'rkl' : ''), alert: rk === 'bad', title: id + ' · ' + STL[st]}));
    let sel = '', chip = r.chip || '', ck = chip === 'Available' ? 'ok' : 'mu';
    if (r.n === 'Ben Okafor') {
      if (conflict) {
        blocks.push({id:'FF-24873', lane:'DAL → LBK · assigned 12 s ago', k:'assigned', ...pos(15, 27), cls:'fresh', alert:false, title:'Assigned by Alex Rivera'});
        blocks.push({id:'FF-24851', lane:'Overlaps FF-24873', k:'bad', ...pos(14, 19.5), cls:'clash', alert:true, title:'Conflict'});
        chip = 'Just assigned'; ck = 'bad'; sel = 'sel';
      } else {
        blocks.push({id:'FF-24851', lane: open ? 'Preview · WAX → SHV' : 'Best match · 6 mi from pickup', k:'brand', ...pos(14, 19.5), cls:'ghost', alert:false, title:'Suggested assignment'});
        if (open) sel = 'sel';
      }
    }
    if (r.n === 'Devon Price' && conflict) { blocks.push({id:'FF-24851', lane:'Next best · preview', k:'brand', ...pos(14, 19.5), cls:'ghost', alert:false, title:'Preview'}); sel = ''; }
    const hasLoad = r.blocks.length > 0;
    return {n:r.n, ini:d.i, units:'T-' + d.t + ' · TR-' + d.tr, chip, ck, pk: ck === 'ok' ? 'ok' : (hasLoad ? 'brand' : 'mu'), blocks, empty: !blocks.length, cls: sel};
  });
  const B = {
    sub: team ? 'Friday, Nov 13 · ' + team.name + ' · 14 trucks · 6 drivers on this board · times in CT' : 'Friday, Nov 13 · 10 drivers on this board · 7 unassigned loads · times in CT',
    sum:(team ? [['Unassigned',2,'warn'],['Assigned',2,'assigned'],['In transit',4,'transit'],['At risk',2,'bad'],['Delivered',4,'ok']] : [['Unassigned',7,'warn'],['Assigned',6,'assigned'],['In transit',14,'transit'],['At risk',3,'bad'],['Delivered',11,'ok']]).map(([label, n, k]) => ({label, n:String(n), k, on:''})),
    queue: QUEUE.filter(q => !team || team.tags.includes(q.id)).map(q => ({...q, rateF: fin ? fm(q.rate) : '', cls: q.hot ? 'hot' : '', canAssign:true, assign:() => c.assign()})),
    qn: team ? '2' : '7', hours: Array.from({length:16}, (_, i) => i % 2 === 0 ? String(6 + i).padStart(2, '0') + ':00' : ''),
    rows, nowP:'33.333%', nowF:'0.33333', wp: open ? 'wp' : '', showQueue: !open,
  };
  const why = (k, t) => ({k, t, ic: k === 'ok' ? I.check : (k === 'bad' ? I.deny : I.clock)});
  const cands = [
    {n:'Ben Okafor', ini:'BO', sub:'T-1117 · TR-5264 · Dallas yard', best:!conflict, changed:conflict, on:'on', cls: conflict ? 'bad on' : 'on', pk: conflict ? 'bad' : 'ok',
      why: conflict ? [why('bad','Assigned to FF-24873 by Alex Rivera · 12 s ago'), why('bad','15:00 → 03:00 overlaps this load')] : [why('ok','6 mi from pickup'), why('ok','Free all day'), why('ok','Medical card valid to Mar 2027'), why('ok','Dry van matches')]},
    {n:'Devon Price', ini:'DP', sub:'T-1149 · TR-5317 · Dallas yard', best:conflict, changed:false, on:'', cls:'', pk:'ok',
      why:[why('ok','8 mi from pickup'), why('ok','Free all day'), why('warn','MVR review due in 12 days'), why('warn','Location 47 min old')]},
    {n:'Kara Nguyen', ini:'KN', sub:'T-1160 · starts FF-24870 at 15:00', best:false, changed:false, on:'', cls:'no', pk:'mu', why:[why('bad','Overlaps FF-24870 · 15:00–20:30')]},
    {n:'Marcus Bell', ini:'MB', sub:'T-1142 · on FF-24801 to Houston', best:false, changed:false, on:'', cls:'no', pk:'brand', why:[why('bad','Busy until ~12:30, then FF-24855 at 14:00')]},
    {n:'Sam Whitfield', ini:'SW', sub:'T-1102 · Waco', best:false, changed:false, on:'', cls:'no', pk:'brand', why:[why('bad','On FF-24866 until 16:00 · 92 mi away')]},
    {n:'Victor Hale', ini:'VH', sub:'Inactive', best:false, changed:false, on:'', cls:'no', pk:'mu', why:[why('bad','Not qualified — a required document expired')]},
  ].filter(x => !team || inTeam(team, (DRIVERS.find(y => y.n === x.n) || {}).t)).map(x => ({...x, pressed: x.on ? 'true' : 'false'}));
  const A = {id:'FF-24851', lane:'Waxahachie, TX → Shreveport, LA',
    when:'Pickup today 14:00–16:00 · deliver Sat 08:00 · 214 mi' + (fin ? ' · $1,150' : ''),
    req:['53’ Dry van','CDL Class A','No hazmat','Owens Corning'], conflict,
    elig: team ? (conflict ? '1 eligible · 2 not eligible · Team A only' : '2 eligible · 1 not eligible · Team A only') : (conflict ? '1 eligible · 5 not eligible' : '2 eligible · 4 not eligible'), cands,
    eq:[{unit:'T-1117', kind:'Volvo VNL 760', sub:'Dallas yard · next PM in 2,140 mi', st:'Available', k:'ok'}, {unit:'TR-5264', kind:'53’ dry van', sub:'Empty · registration valid to Jun 2027', st:'Compatible', k:'ok'}],
    cta: conflict ? 'Choose another driver' : 'Assign & dispatch', blocked: conflict};
  return {B, A};
}

// ---------------------------------------------------------------- loads list + drawer
function buildLoads(X) {
  const {fin, c, sel, drawerId, tab, team} = X;
  const list = team ? LOADS.filter(l => loadInTeam(team, l)) : LOADS.slice(0, 14);
  const cols = '28px 148px 112px 138px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)' + (fin ? ' 84px' : '') + ' 64px 28px';
  const head = [H('Load'),H('Status'),H('Risk'),H('Pickup'),H('Delivery'),H('Driver · equipment')].concat(fin ? [H('Rate',1)] : []).concat([H('Docs'),H('')]);
  const rows = list.map(l => {
    const on = sel.includes(l.id), pod = l.st === 'delivered' && l.docs < 3, moving = MOVING.includes(l.st);
    const risk = l.rk ? T.rk(l.rkt, l.rk) : (moving ? T.rk('On time','ok') : T.tx('—','','mu'));
    const drv = l.drv ? T.tx(l.drv, 'T-' + l.trk + ' · TR-' + l.trl, '', 'mono') : (l.st === 'cancelled' ? T.tx('—','','mu') : T.rk('Unassigned','warn',I.user));
    const cells = [T.chk(on, e => { if (e && e.stopPropagation) e.stopPropagation(); c.setSel(on ? sel.filter(x => x !== l.id) : sel.concat([l.id])); }),
      T.id(l.id, l.cust, () => c.open(l.id)), T.b(STL[l.st], l.st), risk, T.tx(l.pu, l.puT, '', 'num'), T.tx(l.del, l.delT, '', 'num'), drv]
      .concat(fin ? [T.m(fm(l.rate), '$' + (l.rate / l.mi).toFixed(2) + '/mi')] : []).concat([T.docs(l.docs, pod), T.more()]);
    return {cells, open:() => c.open(l.id), cls: on ? 'sel' : (drawerId === l.id ? 'sel' : (l.st === 'cancelled' ? 'dim' : ''))};
  });
  const tabs = (team ? [['All loads','412'],['Unassigned','2'],['In transit','4'],['Delivering today','5'],['At risk','2'],['Missing POD','1'],['Ready to invoice','9']] : [['All loads','1,284'],['Unassigned','7'],['In transit','14'],['Delivering today','12'],['At risk','3'],['Missing POD','2'],['Ready to invoice','23']])
    .map(([label, n], i) => ({label, n, on: i === tab ? 'on' : '', go:() => c.set({tab:i})}));
  const LT = {range: team ? '1–9' : '1–14', total: team ? '412' : '1,284', sub: team ? '412 loads on ' + team.name + '’s 14 trucks · Nov 10 – Nov 16 · times in CT' : '1,284 loads · Nov 10 – Nov 16 · times in CT', cols, head, rows, tabs, noFin: !fin, allOn: sel.length ? 'on' : '', bulk: sel.length > 0 && !drawerId, selN: String(sel.length)};

  const L = LOADS.find(l => l.id === drawerId);
  let DL = null;
  if (L) {
    const picked = ['transit','atdelivery','delivered','podreview','completed'].includes(L.st), delivered = ['delivered','podreview','completed'].includes(L.st);
    const a = alertOf(L);
    const fs = Math.round(L.rate * 0.12), det = L.late ? 75 : 0;
    const finRows = [{k:'Line haul', v:fm2(L.rate)}, {k:'Fuel surcharge (12%)', v:fm2(fs)}].concat(det ? [{k:'Detention (est.)', v:fm2(det)}] : []);
    const doc = (has, due) => has ? {state:'Uploaded · reviewed', tk:'ok', act:'View'} : (due ? {state:'Missing', tk:'bad', act:'Request'} : {state:'Due later', tk:'mu', act:'Upload'});
    DL = {...L, k:L.st, st:STL[L.st], miF:L.mi.toLocaleString('en-US'), rkTxt:L.rkt || '', rk:L.rk || '',
      alert:!!a, aK:a ? a.k : '', aTitle:a ? a.t : '', aText:a ? a.d : '', aBtn:a ? a.b : '',
      docsF:L.docs + '/3', docK: L.docs === 3 ? 'ok' : (L.st === 'delivered' ? 'bad' : 'mu'),
      stops:[
        {n:'1', type:'Pickup', fac:L.pf, city:L.pu, appt:L.puT, done:picked || L.st === 'atpickup' ? 1 : 0, todo: picked || L.st === 'atpickup' ? 0 : 1, k: picked ? 'ok' : (L.st === 'atpickup' ? 'brand' : ''), lc: picked ? 'ok' : '',
          stTxt: picked ? 'Departed ' + (L.dep || '') : (L.st === 'atpickup' ? 'Arrived ' + L.arr : 'Scheduled'), sk: picked ? 'ok' : (L.st === 'atpickup' ? 'brand' : 'mu')},
        {n:'2', type:'Delivery', fac:L.df, city:L.del, appt:L.delT, done:delivered ? 1 : 0, todo:delivered ? 0 : 1, k: delivered ? 'ok' : (L.late ? 'bad' : ''), lc:'none',
          stTxt: delivered ? 'Delivered' : (L.eta ? 'ETA ' + L.eta + (L.late ? ' · +' + L.late : ' · on time') : 'Scheduled'), sk: delivered ? 'ok' : (L.late ? (L.rk === 'bad' ? 'bad' : 'late') : 'mu')}],
      assign:[
        {k:'Driver', v:L.drv || 'Unassigned', tk:L.drv ? '' : 'warn', sub:L.drv ? (DRIVERS.find(d => d.n === L.drv) || {}).ph || '' : 'Select a driver'},
        {k:'Truck', v:L.trk ? 'T-' + L.trk : '—', tk:'', sub:L.trk ? 'Telematics live' : 'Not assigned'},
        {k:'Trailer', v:L.trl ? 'TR-' + L.trl : '—', tk:'', sub:L.eq}],
      finRows, total:fm2(L.rate + fs + det), rpm:'$' + ((L.rate + fs + det) / L.mi).toFixed(2),
      docs:[{k:'Rate confirmation', ...doc(L.docs >= 1, true)}, {k:'Bill of lading', ...doc(L.docs >= 2, picked)}, {k:'Proof of delivery', ...doc(L.docs >= 3, delivered)}],
      activity:activityOf(L).slice(0, 5),
      primary: a ? 'Open full page' : (L.st === 'podreview' ? 'Review POD' : (L.st === 'completed' ? 'Create invoice' : 'Open full page')),
      full:() => c.loadPage(L.id)};
  }
  return {LT, DL};
}
function alertOf(L) {
  const appt = L.delT.split('· ')[1];
  if (L.rk === 'bad' && L.late) return {k:'bad', t:'Will miss the delivery appointment by about ' + L.late, d:'ETA ' + L.eta + ' CT vs. ' + appt + ' at ' + L.df + '. Driver reported traffic on I-35 at 11:05. Customer not yet notified.', b:'Notify customer', b2:'Request new appointment'};
  if (L.rk === 'late') return {k:'late', t:'Running ' + L.late + ' late', d:'ETA ' + L.eta + ' CT vs. ' + appt + ' at ' + L.df + '. Work zone on I-35 near Temple.', b:'Update customer', b2:''};
  if (L.st === 'delivered' && L.docs < 3) return {k:'bad', t:'Proof of delivery missing', d:'Invoicing stays blocked until the POD is uploaded and reviewed. The driver was asked in the app at 16:02 and 09:15.', b:'Request POD', b2:''};
  if (!L.drv && !['cancelled','draft'].includes(L.st)) return {k:'warn', t:'No driver assigned', d:'Pickup ' + L.puT.replace(' · ', ' at ') + '. Ben Okafor is the closest qualified driver (6 mi, free all day).', b:'Assign', b2:''};
  if (L.st === 'draft') return {k:'warn', t:'Draft — rate confirmation missing', d:'This load stays a draft until a rate confirmation is attached and reviewed.', b:'Attach', b2:''};
  if (L.st === 'hold') return {k:'warn', t:'On hold by the customer', d:'PepsiCo asked to hold until a new delivery slot is confirmed. The truck stays assigned.', b:'Release hold', b2:''};
  return null;
}
function activityOf(L) {
  const out = [];
  if (L.late) out.push({who:'System', what:'updated ETA to ' + L.eta + ' — traffic delay', when:'11:18', k:'bad', src:'telematics + maps'});
  if (L.late && L.rk === 'bad') out.push({who:L.drv, what:'reported a delay: “Traffic stopped at Ardmore”', when:'11:05', k:'warn', src:'driver app'});
  if (L.dep) out.push({who:L.drv, what:'departed pickup · BOL scanned', when:L.puT.split(' · ')[0] + ' · ' + L.dep, k:'ok', src:'driver app'});
  if (L.arr) out.push({who:L.drv, what:'arrived at pickup', when:L.arr, k:'ok', src:'geofence'});
  if (L.drv) out.push({who:'Jordan Lee', what:'dispatched to ' + L.drv, when:'Nov 12 · 16:31', k:'info', src:'web'});
  if (L.drv) out.push({who:'Dana Kim', what:'assigned ' + L.drv + ', T-' + L.trk + ', TR-' + L.trl, when:'Nov 12 · 16:20', k:'brand', src:'web'});
  out.push({who:'Dana Kim', what:'created the load from a rate confirmation', when:'Nov 12 · 14:02', k:'mu', src:'web'});
  return out;
}

// ---------------------------------------------------------------- full load page
function buildLoadPage(X) {
  const {loadId} = X;
  const L = LOADS.find(l => l.id === loadId) || LOADS[1];
  const a = alertOf(L);
  const STEPT = {draft:'Nov 12 · 14:02', planned:'Nov 12 · 14:10', assigned:'Nov 12 · 16:20', dispatched:'Nov 12 · 16:31', atpickup:L.arr || '', transit:L.dep || '', atdelivery:'', delivered:'', podreview:'', completed:''};
  let ci = FLOW.indexOf(L.st);
  if (ci < 0) ci = 2;
  const steps = FLOW.map((k, i) => ({l:STL[k], t: i < ci ? STEPT[k] : (i === ci ? (k === 'transit' && L.eta ? 'ETA ' + L.eta : 'now') : ''), st: i < ci ? 'done' : (i === ci ? 'cur' : ''), done: i < ci ? 1 : 0}));
  const d = DRIVERS.find(x => x.n === L.drv);
  const moving = MOVING.includes(L.st);
  const fs = Math.round(L.rate * 0.12), det = L.late ? 75 : 0;
  const delivered = ['delivered','podreview','completed'].includes(L.st), picked = moving && L.st !== 'atpickup' && L.st !== 'dispatched' || delivered;
  const stops = {cols:'minmax(0,1.5fr) 118px 72px 72px 72px 132px', head:[H('Stop'),H('Appointment'),H('Arrived'),H('Departed'),H('Dwell'),H('Status')], rows:[
    {open:noop, cells:[T.tx(L.pf, 'Pickup · ' + L.pu, 'w5'), T.tx(L.puT,'','num t2'), T.tx(L.arr || '—','','num t2'), T.tx(L.dep || '—','','num t2'), T.tx(L.arr && L.dep ? '43m' : (L.st === 'atpickup' ? '56m · clock running' : '—'),'','num t3'), picked ? T.b('Departed','ok') : (L.st === 'atpickup' ? T.b('Loading','atpickup') : T.b('Scheduled','mu'))]},
    {open:noop, cells:[T.tx(L.df, 'Delivery · ' + L.del, 'w5'), T.tx(L.delT,'','num t2'), T.tx(delivered ? '08:41' : '—','','num t2'), T.tx(delivered ? '09:28' : '—','','num t2'), T.tx(delivered ? '47m' : '—','','num t3'), delivered ? T.b('Delivered','ok') : (L.late ? T.rk('ETA ' + L.eta + ' · +' + L.late, L.rk === 'bad' ? 'bad' : 'late') : (L.eta ? T.rk('ETA ' + L.eta,'ok') : T.b('Scheduled','mu')))]}]};
  const docRow = (name, src, has, due, when) => ({open:noop, cells:[T.tx(name,'','w5'), T.tx(has ? src : '—','','t3'), has ? T.b('Approved','ok') : (due ? T.b('Missing','bad') : T.b('Due at delivery','mu')), T.tx(has ? when : '—','','num t3'), T.btn(has ? 'View' : 'Request', noop)]});
  const docs = {cols:'minmax(0,1fr) 160px 132px 104px 76px', head:[H('Document'),H('Source'),H('Review'),H('Uploaded'),H('')], rows:[
    docRow('Rate confirmation','Email inbox · OCR 98%', L.docs >= 1, true, 'Nov 12 · 14:01'),
    docRow('Bill of lading','Driver app scan · OCR 96%', L.docs >= 2, picked, (L.dep || '') + ' today'),
    docRow('Proof of delivery','Driver app scan', L.docs >= 3, delivered && L.docs < 3, 'Nov 12')]};
  const stats = moving ? [
    {k:'Progress', v:(L.done || 0) + ' of ' + L.mi + ' mi', tk:''},
    {k:'ETA · provider + traffic', v:(L.eta || '—') + ' CT', tk: L.rk === 'bad' ? 'bad' : (L.rk === 'late' ? 'late' : '')},
    {k:'Last position', v:'11:18:41 CT', tk:''},
    {k:'Source', v:'Vehicle telematics', tk:''},
    {k:'Accuracy', v:'±6 m', tk:''}] : [
    {k:'Progress', v: delivered ? L.mi + ' of ' + L.mi + ' mi' : 'Not started', tk:''},
    {k:'Distance', v:L.mi + ' mi', tk:''}, {k:'Pickup', v:L.puT, tk:''}, {k:'Delivery', v:L.delT, tk:''}, {k:'Tracking', v: delivered ? 'Ended at delivery' : 'Starts at dispatch', tk:''}];
  const LP = {id:L.id, title:L.pu + ' → ' + L.del, k:L.st, st:STL[L.st], rk:L.rk || '', rkTxt:L.rkt || '',
    sub:L.cust + ' · ' + L.ref + ' · ' + L.mi + ' mi · ' + L.eq + ' · created Nov 12 by Dana Kim', steps,
    alert:!!a, aK:a ? a.k : '', aTitle:a ? a.t : '', aText:a ? a.d : '', aBtn:a ? a.b : '', a2:a ? a.b2 : '',
    fresh: moving ? 'Live · 2 min ago' : (delivered ? 'Trip complete' : 'Not started'), fk: moving ? 'ok' : 'mu', moving,
    oLab:L.pu.split(',')[0] + (L.dep ? ' · departed ' + L.dep : ' · pickup ' + L.puT.split('· ')[1]),
    dLab:L.df + ' · appt ' + L.delT.split('· ')[1], dK: L.rk === 'bad' ? 'bad' : 'brand',
    tLab:'T-' + (L.trk || '') + ' · ' + (L.pos || ''), stats, stops, docs,
    drv:L.drv || 'Unassigned', dini: d ? d.i : '—', dpk: d ? 'brand' : 'mu', dsub: d ? d.ph + ' · CDL ' + d.cdl : 'Assign from the dispatch board',
    asg:[{k:'Truck', v:L.trk ? 'T-' + L.trk : '—'}, {k:'Trailer', v:L.trl ? 'TR-' + L.trl + ' · ' + L.eq : '—'}, {k:'Assigned', v:L.drv ? 'Nov 12 · 16:20 by Dana Kim' : '—'}, {k:'Accepted in app', v:L.drv ? 'Nov 12 · 16:31' : '—'}],
    fin:[{k:'Line haul', v:fm2(L.rate)}, {k:'Fuel surcharge (12%)', v:fm2(fs)}].concat(det ? [{k:'Detention (estimated)', v:fm2(det)}] : []).concat([{k:'Rate per mile', v:'$' + (L.rate / L.mi).toFixed(2)}]),
    total:fm2(L.rate + fs + det), cust:L.cust,
    c1:(CUSTOMERS.find(x => x[0] === L.cust) || [0,0,0,0,'Operations contact'])[4], c1i:'',
    act:activityOf(L)};
  LP.c1i = LP.c1.split(' ').map(w => w[0]).join('').slice(0, 2);
  return LP;
}

// ---------------------------------------------------------------- live fleet map
const GEO = {
  P:(lat, lon) => [Math.round((lon + 104.76) * 71.4), Math.round((37.57 - lat) * 84.2)],
  path(pts) { return pts.map((p, i) => { const [x, y] = GEO.P(p[0], p[1]); return (i ? 'L' : 'M') + x + ' ' + y; }).join(' '); },
};
function buildMap(X) {
  const {c, team} = X;
  const major = [
    [[29.42,-98.49],[30.27,-97.74],[31.10,-97.34],[31.55,-97.15],[32.01,-97.13],[32.75,-97.33],[33.21,-97.13],[34.17,-97.13],[35.47,-97.52],[36.4,-97.3],[37.8,-97.3]],
    [[32.01,-97.13],[32.39,-96.85],[32.78,-96.80],[33.05,-96.99],[33.21,-97.13]],
    [[32.78,-96.80],[32.10,-96.47],[30.72,-95.55],[29.76,-95.37],[29.3,-94.8]],
    [[32.0,-104.9],[32.0,-102.08],[32.45,-99.73],[32.76,-97.80],[32.75,-97.33],[32.78,-96.80],[32.5,-95.4],[32.5,-94.74],[32.52,-93.75],[32.5,-92.1],[32.3,-90.2],[32.3,-87.6]],
    [[32.78,-96.80],[33.14,-96.11],[33.16,-94.97],[33.43,-94.05],[34.75,-92.29]],
    [[35.2,-104.9],[35.22,-101.83],[35.47,-97.52],[35.44,-95.98],[35.39,-94.40],[34.75,-92.29],[35.15,-90.05],[35.6,-87.6]],
    [[35.47,-97.52],[36.15,-95.99],[37.08,-94.51],[37.8,-93.8]],
    [[32.78,-96.80],[33.64,-96.61],[33.99,-96.37],[34.93,-95.77],[35.75,-95.37],[36.15,-95.99]],
    [[30.1,-104.9],[30.4,-101.0],[30.05,-99.14],[29.42,-98.49],[29.6,-97.0],[29.76,-95.37],[30.08,-94.10],[30.23,-93.2],[30.4,-91.2],[30.4,-87.6]],
    [[29.42,-98.49],[28.4,-97.9],[27.5,-97.4]],
    [[35.22,-101.83],[33.58,-101.85]],
    [[33.43,-94.05],[32.52,-93.75],[31.76,-93.09],[31.0,-92.4],[30.2,-92.0]],
  ];
  const minor = [
    [[30.27,-97.74],[30.1,-96.1],[29.76,-95.37]], [[31.55,-97.15],[30.63,-96.33],[29.76,-95.37]],
    [[33.91,-98.49],[33.64,-96.61],[33.66,-95.56],[33.43,-94.05]], [[33.66,-95.56],[32.35,-95.30],[31.34,-94.73]],
    [[29.76,-95.37],[31.34,-94.73],[32.5,-94.4],[33.43,-94.05]], [[32.75,-97.33],[33.91,-98.49],[34.4,-99.75],[35.22,-101.83]],
    [[31.55,-97.15],[31.7,-98.99],[32.45,-99.73]], [[32.35,-95.30],[32.10,-96.47]], [[34.17,-97.13],[34.6,-98.4],[35.47,-97.52]],
  ];
  const states = [
    [[36.5,-103.04],[36.5,-100.0],[34.56,-100.0],[34.38,-99.6],[34.2,-99.2],[33.9,-98.5],[33.87,-97.9],[33.85,-97.3],[33.73,-96.6],[33.85,-96.0],[33.85,-95.6],[33.6,-95.0],[33.55,-94.48],[33.55,-94.04]],
    [[33.55,-94.04],[33.02,-94.04],[31.99,-94.04],[31.5,-93.8],[31.0,-93.55],[30.5,-93.7],[29.7,-93.84]],
    [[36.5,-94.62],[35.4,-94.43],[33.64,-94.48]], [[33.02,-94.04],[33.02,-91.17]],
    [[37.0,-103.0],[37.0,-94.62]], [[37.0,-103.0],[36.5,-103.0]], [[36.5,-103.04],[32.0,-103.06],[32.0,-104.9]],
    [[36.5,-94.62],[36.5,-90.15]], [[36.5,-90.15],[35.15,-90.05],[34.0,-91.0],[33.02,-91.17],[31.0,-91.6],[31.0,-89.73],[30.2,-89.6]], [[37.0,-94.62],[37.8,-94.62]],
  ];
  const coast = [[27.0,-97.4],[27.5,-97.3],[27.85,-97.1],[28.15,-96.8],[28.45,-96.2],[28.75,-95.6],[29.05,-95.1],[29.32,-94.75],[29.55,-94.35],[29.68,-94.0],[29.7,-93.84],[29.75,-93.3],[29.6,-92.6],[29.55,-92.0],[29.3,-91.3],[29.1,-90.6],[29.0,-89.9],[29.2,-89.4],[30.2,-89.6],[30.4,-89.0],[30.35,-88.4],[30.4,-87.6],[25.5,-87.6],[25.5,-97.6]];
  const cities = [['Dallas',32.78,-96.80,'big',16,-12],['Fort Worth',32.75,-97.33,'',-24,14],['Oklahoma City',35.47,-97.52,'big',-46,-14],['Tulsa',36.15,-95.99,'',20,-10],['Houston',29.76,-95.37,'big',34,8],['San Antonio',29.42,-98.49,'big',-6,16],['Austin',30.27,-97.74,'',-34,4],['Waco',31.55,-97.15,'',-30,-2],['Temple',31.10,-97.34,'',-34,-6],['Shreveport',32.52,-93.75,'',4,-14],['Abilene',32.45,-99.73,'',0,-14],['Ardmore',34.17,-97.13,'',-38,0],['Texarkana',33.43,-94.05,'',0,-14],['Tyler',32.35,-95.30,'',0,14],['McAlester',34.93,-95.77,'',-40,4],['Wichita Falls',33.91,-98.49,'',0,-13],['Lufkin',31.34,-94.73,'',0,13]]
    .map(([n, lat, lon, cls, dx, dy]) => { const [x, y] = GEO.P(lat, lon); return {n, x:x + dx, y:y + dy, cls}; });
  [['Texas',31.0,-99.1],['Oklahoma',36.55,-98.3],['Louisiana',31.2,-93.15],['Arkansas',34.05,-93.6]].forEach(([n, lat, lon]) => { const [x, y] = GEO.P(lat, lon); cities.push({n, x, y, cls:'st'}); });
  const shields = [['35',33.7,-97.15],['45',31.4,-96.0],['20',32.62,-99.0],['30',33.15,-95.5],['40',35.43,-94.9],['44',35.8,-96.8],['10',29.6,-96.9]].map(([n, lat, lon]) => { const [x, y] = GEO.P(lat, lon); return {n, x, y}; });
  const T5 = [
    ['1121',31.06,-97.46,190,'bad','sel','T-1121, Jamal Carter, speeding 74 mph'],
    ['1108',34.35,-97.17,355,'brand','','T-1108, Ana Ruiz, 61 mph northbound'],
    ['1142',30.05,-95.43,170,'brand','','T-1142, Marcus Bell, 58 mph'],
    ['1155',35.2,-95.6,20,'brand','','T-1155, Priya Shah, 63 mph'],
    ['1102',31.55,-97.15,0,'mu','','T-1102, Sam Whitfield, stopped at Waco'],
    ['1171',32.4,-99.5,270,'off','stale','T-1171, last seen 22 minutes ago'],
    ['1168',30.72,-95.55,340,'brand','','T-1168, Rafael Gomez, 62 mph northbound'],
    ['1180',30.27,-97.74,190,'brand','','T-1180, Ken Ito and Katie Walsh, team, 58 mph'],
    ['1186',32.54,-94.37,95,'brand','','T-1186, Jerome Banks, 63 mph'],
  ].filter(v => inTeam(team, v[0])).map(([unit, lat, lon, h, k, cls, aria]) => { const [x, y] = GEO.P(lat, lon); return {unit, x, y, h:String(h), k, cls, aria}; });
  const [cx, cy] = GEO.P(32.70, -96.72);
  const fences = [['Sysco Central TX',30.33,-97.70,44,'teal'],['Walmart DC 6094',35.38,-97.50,40,'bad']].map(([l, lat, lon, d, k]) => { const [x, y] = GEO.P(lat, lon); return {l, x, y, d:String(d), k}; });
  const speeds = [66,67,66,68,69,68,67,69,70,69,68,70,71,70,69,70,71,72,71,72,72,71,72,73,74,75,76,76,75,75,74];
  const sx = i => (i * 312 / 30).toFixed(1), sy = v => ((80 - v) / 20 * 96).toFixed(1);
  const spark = speeds.map((v, i) => (i ? 'L' : 'M') + sx(i) + ' ' + sy(v)).join(' ');
  return {
    water: GEO.path(coast) + ' Z',
    states: states.map(s => GEO.path(s)).join(' '), minor: minor.map(s => GEO.path(s)).join(' '), major: major.map(s => GEO.path(s)).join(' '),
    trail: GEO.path([[33.05,-96.99],[32.78,-96.80],[32.39,-96.85],[32.01,-97.13],[31.55,-97.15],[31.10,-97.34],[31.06,-97.46]]),
    plan: GEO.path([[31.06,-97.46],[30.63,-97.68],[30.33,-97.70]]),
    cities, shields, trucks:T5, fences,
    clusters:[team ? {n:'3', x:cx, y:cy, aria:'3 trucks in Dallas – Fort Worth'} : {n:'6', x:cx, y:cy, aria:'6 trucks in Dallas – Fort Worth'}],
    sub: team ? team.name + ' · 14 trucks · 13 reporting · positions from vehicle telematics' : '41 trucks · 38 reporting · positions from vehicle telematics', vn: team ? '14' : '41',
    filters:(team ? [['All','14','mu','on'],['Moving','8','brand',''],['Stopped','4','mu',''],['Alerts','1','bad',''],['Stale','1','off','']] : [['All','41','mu','on'],['Moving','18','brand',''],['Stopped','20','mu',''],['Alerts','2','bad',''],['Stale','3','off','']]).map(([l, n, k, on]) => ({l, n, k, on})),
    list:[
      ['T-1121','Jamal Carter','I-35 S near Temple · speeding','74 mph','bad','12 s','ok','bad','on'],
      ['T-1108','Ana Ruiz','I-35 N near Ardmore · load at risk','61 mph','','2 m','ok','brand',''],
      ['T-1142','Marcus Bell','I-45 S near Spring','58 mph','','1 m','ok','brand',''],
      ['T-1155','Priya Shah','US-69 N near McAlester','63 mph','','40 s','ok','brand',''],
      ['T-1133','Luis Ortega','At pickup · GP Irving Mill · 56 min','0 mph','mu','1 m','ok','mu',''],
      ['T-1102','Sam Whitfield','Loading · HD Supply Waco','0 mph','mu','3 m','warn','mu',''],
      ['T-1129','Tom Reyes','Parked · PepsiCo Garland · on hold','0 mph','mu','4 m','warn','mu',''],
      ['T-1160','Kara Nguyen','Dallas yard · starts 15:00','0 mph','mu','1 m','ok','mu',''],
      ['T-1117','Ben Okafor','Dallas yard · available','0 mph','mu','2 m','ok','mu',''],
      ['T-1149','Devon Price','Dallas yard · last seen 10:33','—','mu','47 m','bad','off',''],
      ['T-1138','Leah Morgan','Houston shop · out of service','—','mu','2 d','off','off',''],
    ].filter(x => inTeam(team, x[0])).map(([unit, drv, line, spd, sk, fresh, fk, k, sel]) => ({unit, drv, line, spd, sk, fresh, fk, k, sel})),
    spark, zx:sx(24), zw:(312 - Number(sx(24))).toFixed(1),
    openLoad:() => c.loadPage('FF-24839'),
  };
}

// ---------------------------------------------------------------- driver profile
function buildDriver(X) {
  const {c, driverName} = X;
  const d = DRIVERS.find(x => x.n === driverName) || DRIVERS[0];
  const q = qualOf(d);
  const QSRC = ['Upload · OCR 97% · reviewed by Rosa Delgado','Driver app scan · reviewed','Provider pull · reviewed','Annual query · reviewed','Upload · on file since hire','Upload · on file since hire'];
  const QSUB = ['Texas · endorsements: ' + ((DRV_X[d.n] || [])[1] || 'none'),'','','','',''];
  const LAB = {ok:'Valid', warn:'Expiring', bad:'Action needed', info:'In review'};
  const qrows = d.q.map(([k, t], i) => {
    const onfile = t === 'On file';
    let sub = QSUB[i];
    if (i === 1 && k === 'warn') sub = 'Reminders sent Nov 6 and Nov 12 via Telegram';
    const label = onfile ? 'On file' : (k === 'warn' ? 'Expires in ' + t : (k === 'bad' ? t : LAB[k]));
    return {open:noop, cells:[T.tx(QFULL[i], sub, 'w5'), T.b(label, k), T.tx(onfile || k === 'bad' ? '—' : (k === 'warn' ? new Date(2026, 10, 13 + parseInt(t, 10)).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'}) : t),'','num t2'), T.tx(QSRC[i],'','t3'), T.btn(k === 'warn' || k === 'bad' ? 'Request' : 'View', noop, k === 'warn' || k === 'bad' ? 'pri' : '')]};
  });
  const mine = LOADS.filter(l => l.drv === d.n);
  const hist = [['FF-24760','Dallas → Houston','Nov 11','completed'],['FF-24731','Houston → Dallas','Nov 10','completed'],['FF-24702','Dallas → San Antonio','Nov 7','completed']];
  const lrows = mine.map(l => ({open:() => c.open(l.id), cells:[T.id(l.id,'',() => c.open(l.id)), T.tx(l.pu.split(',')[0] + ' → ' + l.del.split(',')[0], l.cust), T.tx(l.delT,'','num t3'), T.b(STL[l.st], l.st)]}))
    .concat(hist.map(([id, lane, dt, st]) => ({open:noop, cells:[T.tx(id,'','mono fs12 w5'), T.tx(lane,'','t2'), T.tx(dt,'','num t3'), T.b(STL[st], st)]})));
  const now = mine.filter(l => ['transit','atpickup','assigned','hold','dispatched'].includes(l.st)).map(l => ({id:l.id, lane:l.pu.split(',')[0] + ' → ' + l.del.split(',')[0], st:STL[l.st], k:l.st,
    t: l.eta ? 'ETA ' + l.eta + (l.late ? ' · +' + l.late : ' · on time') : 'Pickup ' + l.puT, go:() => c.open(l.id)}));
  if (!now.length) now.push({id:'—', lane:'No load right now', st:d.st, k:d.sk, t:'Available for dispatch', go:noop});
  const L0 = loadOf(d.n);
  const warnItem = d.q.findIndex(x => x[0] === 'warn' || x[0] === 'bad');
  return {n:d.n, ini:d.i, pk: d.sk === 'ok' ? 'ok' : (d.sk === 'mu' ? 'mu' : 'brand'), st:d.st, sk:d.sk, ql:q.k === 'ok' ? 'Qualified to dispatch' : q.v, qk:q.k,
    sub:'Employee ' + d.emp + ' · hired ' + d.hired + ' · ' + d.ph + ((DRV_X[d.n] || [])[0] ? ' · ' + DRV_X[d.n][0] + '@lonestarfreight.com' : ''),
    alert: warnItem >= 0, aK: warnItem >= 0 ? d.q[warnItem][0] : '', aT: warnItem >= 0 ? QFULL[warnItem] + (d.q[warnItem][0] === 'bad' ? ' — ' + d.q[warnItem][1].toLowerCase() : ' expires in ' + d.q[warnItem][1]) : '',
    aD:'When it lapses FlyFleet stops new assignments for ' + d.n.split(' ')[0] + ' until a reviewed replacement is on file. Reminders alone don’t change eligibility.', aB:'Request document',
    q:{cols:'minmax(0,1.5fr) 132px 104px minmax(0,1.3fr) 84px', head:[H('Item'),H('Status'),H('Expires'),H('Source'),H('')], rows:qrows},
    loads:{cols:'92px minmax(0,1.4fr) 110px 112px', head:[H('Load'),H('Lane'),H('Delivery'),H('Status')], rows:lrows.slice(0, 6)},
    now, trk: d.t === '—' ? '—' : 'T-' + d.t, trl: d.tr === '—' ? '—' : 'TR-' + d.tr, pos: L0 && L0.pos ? L0.pos + ' · 2 min ago' : 'Dallas yard · 2 min ago',
    chans:[
      d.tg ? {n:'Telegram', d:'Linked Nov 2 · alerts, load updates, messages', ic:I.send, k:'info', act:'Unlink'} : {n:'Telegram', d:'Not linked · driver must start the bot first', ic:I.send, k:'mu', act:'Send link'},
      d.app ? {n:'Driver app', d:'iOS · v3.2.0 · last sync 11:18', ic:I.mobile, k:'brand', act:'Sign out device'} : {n:'Driver app', d:'Not installed', ic:I.mobile, k:'mu', act:'Invite'},
      {n:'SMS fallback', d:d.ph + ' · used if app and Telegram fail', ic:I.phone, k:'mu', act:'Edit'}],
    lic:d.lic,
    stats:[{k:'Loads', v:String(12 + d.i.charCodeAt(0) % 9)}, {k:'On-time delivery', v:(90 + d.i.charCodeAt(1) % 9) + '%'}, {k:'Miles', v:(5200 + (d.i.charCodeAt(0) * 37) % 1800).toLocaleString('en-US')}, {k:'Speeding incidents', v: d.n === 'Jamal Carter' ? '2' : (d.n === 'Priya Shah' ? '1' : '0')}]};
}

// ---------------------------------------------------------------- compliance
function buildSafety(X) {
  const {c} = X;
  const IC = {ok:I.check, warn:I.clock, bad:I.alert, info:I.eye};
  const label = (k, t) => k === 'warn' ? t : (t === 'On file' ? 'On file' : t);
  const rows = DRIVERS.map(d => {
    const q = qualOf(d);
    const ol = q.k === 'ok' ? 'Qualified' : (q.k === 'warn' ? 'Expiring' : (q.k === 'info' ? 'In review' : (d.q.some(x => x[1].indexOf('Expired') === 0) ? 'Expired' : 'Missing')));
    return {n:d.n, ini:d.i, open:() => c.driver(d.n), cells:d.q.map(([k, t]) => ({k, t:label(k, t), ic:IC[k]})), ok:q.k, ol};
  });
  return {cols:'minmax(0,1.3fr) repeat(6,minmax(0,1fr)) 112px', head:['Driver'].concat(QNAMES).concat(['Dispatchable']), rows,
    kpis:[{label:'Expired',value:'1',suffix:'',sub:'Victor Hale · medical card',k:'bad',sk:'bad'},{label:'Expiring ≤ 30 days',value:'5',suffix:'',sub:'4 drivers · 1 truck',k:'warn',sk:'warn'},{label:'Missing',value:'2',suffix:'',sub:'road test · clearinghouse',k:'bad',sk:'mu'},{label:'Waiting for review',value:'3',suffix:'',sub:'oldest 2 days',k:'info',sk:'mu'},{label:'Fully qualified',value:'7',suffix:' / 12',sub:'active drivers',k:'ok',sk:'mu'}],
    queue:[{t:'Medical certificate',who:'Kara Nguyen · expires Mar 2028 (read)',conf:'96%',ck:'ok',src:'Driver app scan · 09:12'},{t:'Registration',who:'TR-5307 · Texas · 2027',conf:'91%',ck:'ok',src:'Upload · Nov 12'},{t:'Certificate of insurance',who:'Lone Star Freight · policy year 2027',conf:'88%',ck:'warn',src:'Email inbox · Nov 11'}]};
}

// ---------------------------------------------------------------- document review (OCR)
function buildDocReview() {
  const f = (l, v, conf, k, st, ic, mono, note, cls) => ({l, v, conf, pct:conf, k, st, ic, mono:mono ? 'mono' : '', note:note || '', cls:cls || ''});
  return {fields:[
    f('Load reference','FF-24782','99%','ok','Matches load',I.check,1),
    f('BOL number','55102','97%','ok','Matches BOL',I.check,1),
    f('Consignee','HD Supply Shreveport #6','94%','ok','Matches stop 2',I.check,0),
    f('Delivery date','11/12/2026','96%','ok','Read',I.check,1),
    f('Delivery time','11/12 11:34','71%','warn','Check',I.alert,1,'Handwritten. Arrival event in FlyFleet says 11:28 — confirm what the paper shows; don’t copy the system time.','lo sel'),
    f('Pieces','22 PLT','90%','ok','Matches BOL',I.check,1),
    f('Exceptions noted','none','86%','ok','Read',I.check,0),
    f('Signature present','Yes','93%','ok','Detected',I.check,0),
    f('Signer name','R. Alvarez','62%','warn','Check',I.alert,0,'Low confidence handwriting. Leave as read or mark unreadable — never guess a name.','lo'),
  ]};
}

// ---------------------------------------------------------------- maintenance
function buildMaint(X) {
  const {fin} = X;
  const W = (id, unit, title, pri, pk, meta, vendor, date, rts, rtsd, rk) => ({id, unit, title, pri, pk, meta, vendor, date, rts:rts || '', rtsd:rtsd || '', rk:rk || ''});
  return {
    kpis:[{label:'Open work orders',value:'9',suffix:'',sub:'3 high priority',k:'warn',sk:'mu'},{label:'Out of service',value:'1',suffix:'',sub:'T-1138 since Nov 11',k:'bad',sk:'bad'},{label:'Avg downtime · 30 d',value:'2.4',suffix:' days',sub:'down from 3.1',k:'ok',sk:'mu'},
      fin ? {label:'Cost this month',value:'$8,420',suffix:'',sub:'12 work orders · parts + labor',k:'mu',sk:'mu'} : {label:'Cost this month',value:'—',suffix:'',sub:'Needs finance access',k:'off',sk:'mu'}],
    cols:[
      {l:'Open', n:'2', k:'warn', cards:[W('WO-1182','T-1121','Brake adjustment — DVIR defect','High','bad','Reported by Jamal Carter · 06:41','Not scheduled','Today'), W('WO-1184','TR-5301','Reefer unit alarm code 22','Medium','warn','Telematics fault · 08:15','Reefer service partner','Nov 14')]},
      {l:'Scheduled', n:'2', k:'violet', cards:[W('WO-1179','T-1121','Annual DOT inspection','Medium','warn','Due in 11 days','Lone Star shop','Nov 20'), W('WO-1177','TR-5307','Inspection & registration renewal','Medium','warn','Registration expires in 23 days','Lone Star shop','Nov 18')]},
      {l:'In progress', n:'1', k:'brand', cards:[W('WO-1175','T-1163','PM-A service — 520k mi','Low','mu','Dallas shop · bay 2','Metro Diesel Service','Since 08:00')]},
      {l:'Waiting parts', n:'1', k:'late', cards:[W('WO-1170','T-1138','Turbo actuator replacement','High','bad','Out of service since Nov 11','Gulf Coast Truck Repair','Part ETA Nov 17')]},
      {l:'Completed', n:'3', k:'ok', cards:[W('WO-1168','T-1149','Steer tires replaced','Low','mu','Closed today 09:40','Metro Diesel Service','Today','Return-to-service check pending','— not dispatchable until signed off','warn'), W('WO-1166','T-1155','Headlamp replaced','Low','mu','Closed Nov 12','Lone Star shop','Nov 12','Returned to service','by Owen Brooks','ok')]},
    ]};
}

// ---------------------------------------------------------------- reports
function buildReports(X) {
  const {fin} = X;
  const W = [['Sep 21',89.1],['Sep 28',90.4],['Oct 5',88.7],['Oct 12',91.9],['Oct 19',92.6],['Oct 26',90.8],['Nov 2',93.3],['Nov 9',93.0]];
  const C = [['Kimberly-Clark',14,12,86,'58 min'],['Sysco North Texas',39,35,90,'44 min'],['Walmart Transportation',46,42,91,'51 min'],['Owens Corning',19,18,95,'35 min'],['PepsiCo Logistics',33,31,94,'22 min'],['Home Depot Supply',58,56,97,'18 min']];
  return {
    cat:[{l:'Operational', items:[{l:'On-time delivery',on:'on',lock:false},{l:'Loads by status',on:'',lock:false},{l:'Delivered, awaiting POD',on:'',lock:false},{l:'Equipment utilization',on:'',lock:false},{l:'Expiring documents',on:'',lock:false}]},
         {l:'Financial', items:['Revenue by customer','Invoice aging','Expenses by category','Driver statements','Fuel and IFTA'].map(l => ({l, on:'', lock:!fin}))}],
    kpis:[{label:'On-time delivery',value:'91.4',suffix:'%',sub:'▲ 1.2 pts vs prior 8 weeks',sk:'ok'},{label:'Late deliveries',value:'38',suffix:' of 442',sub:'8.6% of delivered stops',sk:'mu'},{label:'Average lateness',value:'42',suffix:' min',sub:'median 27 min',sk:'mu'},{label:'Weakest lane',value:'DAL→OKC',suffix:'',sub:'84% on time · 61 loads',sk:'late'}],
    weeks:W.map(([l, v]) => ({l, v:v.toFixed(1), h:((v - 80) / 20 * 100).toFixed(1) + '%', k: v >= 95 ? 'ok' : (v >= 90 ? 'brand' : 'late')})),
    aria:'On-time delivery by week, from 89.1% to 93.0%, below the 95% target every week',
    t:{cols:'minmax(0,1.4fr) 64px 72px 60px minmax(0,1.2fr) 84px', head:[H('Customer'),H('Loads',1),H('On time',1),H('Late',1),H('On-time %'),H('Avg late',1)],
       rows:C.map(([n, ld, ot, pct, avg]) => ({open:noop, cells:[T.tx(n,'','w5'), T.n(String(ld)), T.n(String(ot)), T.n(String(ld - ot)), T.bar(pct + '%', pct + '%', pct >= 95 ? 'ok' : (pct >= 90 ? 'brand' : 'late')), T.n(avg)]}))},
    jobs:[{n:'loads_2026-11-01_to_11-13.csv',d:'Loads · requested by Dana Kim · 11:12',st:'Ready',k:'ok',dis:false},{n:'on_time_by_customer_8w.xlsx',d:'This report · requested 11:19 · 442 rows',st:'Running',k:'info',dis:true}]};
}

// ---------------------------------------------------------------- team & access
function buildTeam() {
  const spec = (s, label) => s.split('').map((ch, i) => {
    const act = ['View','Create','Edit','Assign','Approve','Delete','Export'][i];
    if (ch === '-') return {na:1, box:0};
    const on = ch === '1' || ch === '+';
    const cls = ch === '+' ? 'add' : (ch === 'x' ? 'rem' : (ch === 'L' ? 'lockd' : (on ? 'on' : '')));
    return {na:0, box:1, on: on ? 1 : 0, cls, pressed: on ? 'true' : 'false', aria: label + ' — ' + act};
  });
  const G = [
    ['Operations', [['Dashboard','1------'],['Dispatch board','1--1--0'],['Loads','1111-0x','','',1],['Load rates & revenue','0-0----',1,'rates, pay, margin'],['Live fleet & trip history','1-----0'],['Fleet alerts','1--+---','','',1],['Messages','11---0-']]],
    ['Directory', [['Customers','100--00'],['Drivers','100--00'],['Driver sensitive IDs','0------',1,'license #, birth date'],['Owners','100--00'],['Owner tax IDs and bank','0------',1,'EIN or SSN, payout bank']]],
    ['Safety & fleet', [['Compliance','0000-00'],['Inspections','0000-00'],['Documents on loads','11--000'],['Trucks','100--00'],['Trailers','100--00'],['Maintenance','100--00']]],
    ['Finance', [['Invoices','000-000'],['Payments','00----0'],['Driver statements','000-000'],['Owner settlements','000-000'],['Fuel & IFTA','000---0']]],
    ['Administration', [['Reports','1-----0'],['Team & access','L------','','Main Admin only'],['Organization settings','0------'],['Audit log','0------']]],
  ];
  return {
    roles:[['Main Admin','Everything, including team & billing','1',1],['Operations Manager','Operations + finance read','2',0],['Dispatcher','Plans and assigns loads','9',0,'on'],['Safety Manager','Compliance, documents, alerts','1',0],['Fleet Manager','Equipment and maintenance','1',0],['Accounting','Invoices, payments, statements','2',0],['Read-only','Dashboards and reports','1',0],['Equipment owner','Owner portal · their own equipment only','6',1]]
      .map(([n, d, cnt, sys, on]) => ({n, d, cnt, sys, on:on || ''})),
    mem:['JL','AR','SP','NC'], acts:['View','Create','Edit','Assign','Approve','Delete','Export'], cols:'minmax(0,1fr) repeat(7,60px)',
    groups:G.map(([g, rows]) => ({g, rows:rows.map(([m, s, sens, note, chg]) => ({m, sens:sens ? 1 : 0, note:note || '', cls: chg ? 'chg' : '', cells:spec(s, m)}))})),
    ovr:[{who:'Alex Rivera', ini:'AR', txt:'Reports › Export · month-end KPI pack', t:'Allow', k:'ok'}, {who:'Nina Cole', ini:'NC', txt:'Messages › Create · trainee, read only', t:'Deny', k:'bad'}],
    hist:[{who:'Dana Kim', what:'granted Fleet alerts › View to Dispatcher', when:'Nov 10'}, {who:'Dana Kim', what:'denied Messages › Create for Nina Cole', when:'Nov 6'}, {who:'FlyFleet', what:'provisioned role templates', when:'Nov 2'}]};
}

// ---------------------------------------------------------------- settings: alert policy + integrations
function buildSettings(X) {
  const {c, screen} = X;
  const isPolicy = screen === 'policy';
  const nav = [['Organization','building',''],['Team & access','team','team'],['Dispatch teams','truck','teams'],['Notifications','bell',''],['Fleet alert policies','gauge','policy'],['Integrations','link','settings'],['Numbering & formats','hash',''],['Data & retention','layers',''],['Billing & plan','dollar',''],['Audit log','history','audit']]
    .map(([l, ic, k]) => ({l, ic:I[ic], on: k && k === screen ? 'on' : '', go: k ? () => c.go(k) : noop}));
  const SET = {nav, page: isPolicy ? 'Fleet alert policies' : 'Integrations', sub: isPolicy ? 'Rules that turn raw GPS samples into incidents people act on' : 'Providers connected to Lone Star Freight · each behind an adapter'};
  const PO = {
    list:[['Highway sustained speeding','v3','ok','on'],['Yard speed over 10 mph','v1','ok',''],['Geofence dwell over 2 h','v2','ok',''],['GPS stale over 15 min','v1','off','']].map(([l, v, k, on]) => ({l, v, k, on})),
    who:[
      {ini:'DR', n:'Driver', when:'Immediately', ch:[{l:'Telegram',ic:I.send,k:'info'},{l:'App push',ic:I.mobile,k:'brand'}]},
      {ini:'DS', n:'Dispatcher on duty', when:'Immediately', ch:[{l:'In app',ic:I.bell,k:'brand'},{l:'Push',ic:I.mobile,k:'brand'}]},
      {ini:'SF', n:'Safety manager', when:'If not acknowledged in 10 min', ch:[{l:'Email',ic:I.mail,k:'mu'},{l:'SMS',ic:I.phone,k:'mu'}]}],
    prev:[{k:'Samples above 70 mph',v:'41',s:'last 7 days · 6 trucks'},{k:'Incidents this policy creates',v:'3',s:'2 trucks · one per episode'},{k:'Alerts a naive rule would send',v:'41',s:'one per sample — mostly noise'}]};
  const IN = {
    cards:[
      {n:'Samsara', tag:'Pilot · ADR pending', cat:'Telematics · GPS and vehicle speed', ic:I.truck, k:'brand', st:'Connected', sk:'ok', kv:[{k:'Vehicles mapped',v:'41 of 41'},{k:'Events · 24 h',v:'2,184 · 0 failed'},{k:'Last event',v:'11:20:14 CT'}], acts:[{l:'Device mapping',cls:''},{l:'Test',cls:'ghost'}]},
      {n:'Telegram bot', tag:'@lonestar_dispatch_bot', cat:'Driver alerts and messaging', ic:I.send, k:'info', st:'Connected', sk:'ok', kv:[{k:'Drivers linked',v:'31 of 42'},{k:'Webhook',v:'Secret token verified'},{k:'Deliveries · 24 h',v:'312 · 2 retried'}], acts:[{l:'Linking',cls:''},{l:'Send test',cls:'ghost'}]},
      {n:'Mapbox', tag:'', cat:'Maps, geocoding and ETAs', ic:I.map, k:'teal', st:'Connected', sk:'ok', kv:[{k:'Geocodes · 30 d',v:'1,904'},{k:'Mileage',v:'Practical route'},{k:'Fallback',v:'Google Maps (off)'}], acts:[{l:'Configure',cls:''}]},
      {n:'AI assistant', tag:'Read-only', cat:'Q&A, summaries, document extraction', ic:I.spark, k:'violet', st:'Enabled', sk:'ok', kv:[{k:'Provider',v:'Set by org · via adapter'},{k:'Data allowed',v:'Loads, tracking, documents'},{k:'This month',v:'1,240 requests · cap $50'}], acts:[{l:'Data controls',cls:''},{l:'Usage',cls:'ghost'}]},
      {n:'Amazon SES', tag:'', cat:'Email · invoices and notices', ic:I.mail, k:'mu', st:'Connected', sk:'ok', kv:[{k:'Sending domain',v:'lonestarfreight.com'},{k:'Bounces · 30 d',v:'0.4%'},{k:'Last send',v:'11:02 CT'}], acts:[{l:'Configure',cls:''}]},
      {n:'WEX Fleet', tag:'38 cards', cat:'Fuel cards · purchases for Fuel and IFTA', ic:I.fuel, k:'warn', st:'Connected', sk:'ok', kv:[{k:'Cards mapped',v:'38 of 41 trucks'},{k:'Purchases · 24 h',v:'14 · 0 failed'},{k:'Last sync',v:'11:02 CT'}], acts:[{l:'Card mapping',cls:''},{l:'Test',cls:'ghost'}]},
      {n:'QuickBooks Online', tag:'', cat:'Accounting export', ic:I.dollar, k:'mu', st:'Not connected', sk:'off', kv:[{k:'Today',v:'CSV export'},{k:'Would sync',v:'Invoices, payments'},{k:'Owner',v:'Accounting'}], acts:[{l:'Connect',cls:'pri'}]}],
    t:{cols:'minmax(0,1.3fr) 104px 100px 120px 168px', head:[H('Event'),H('Provider'),H('Received'),H('Dedup key'),H('Result')], rows:[
      ['vehicle.location · T-1121','Samsara','11:20:03','evt_9f2a…','Processed','ok'],
      ['vehicle.location · T-1121','Samsara','11:20:03','evt_9f2a…','Skipped — duplicate','mu'],
      ['message.inbound · Jamal Carter','Telegram','11:19:02','upd_88231…','Processed','ok'],
      ['vehicle.location · T-1108','Samsara','11:18:41','evt_9e71…','Processed','ok'],
      ['vehicle.location · unknown device','Samsara','10:52:16','evt_8c10…','Rejected — unmapped','warn']]
      .map(([e, p, r, k, res, rk]) => ({open:noop, cells:[T.tx(e,'','mono fs12 w5'), T.tx(p,'','t2'), T.tx(r,'','mono fs12 t3'), T.tx(k,'','mono fs12 mu'), T.b(res, rk)]}))}};
  return {SET, PO, IN};
}

// ---------------------------------------------------------------- messages
function buildMessages(X) {
  const {team} = X;
  const hide = n => { const d = DRIVERS.find(x => x.n === n); return !!(team && d && !inTeam(team, d.t)); };
  return {
    convs:[
      ['Jamal Carter','JC','late',I.send,'Copy. Slowing down — work zone ahead.','11:19','','on'],
      ['Ana Ruiz','AR','brand',I.mobile,'Traffic is stopped at Ardmore, about 30 min.','11:05','1',''],
      ['Walmart DC 6094','WM','mu',I.mail,'Kelly Moore: Can you share an updated ETA?','10:58','1',''],
      ['Luis Ortega','LO','brand',I.mobile,'At the dock, door 14.','10:26','1',''],
      ['Marcus Bell','MB','brand',I.send,'BOL uploaded. Rolling.','05:22','',''],
      ['Dispatch team','DT','mu',I.team,'Alex: I’ll take the Sysco reefers tonight.','09:40','',''],
      ['Priya Shah','PS','brand',I.mobile,'Thanks!','Yesterday','',''],
    ].filter(x => !hide(x[0])).map(([n, ini, pk, ch, last, t, unread, on]) => ({n, ini, pk, ch, last, t, unread, on, uw: unread ? 'uw' : ''})),
    msgs:[
      {sys:1, k:'brand', ic:I.loads, title:'Load FF-24839 dispatched to Jamal', body:'Lewisville → Austin · pickup 09:00 · delivery appointment 15:30', meta:'Sent to app and Telegram · delivered', t:'08:58'},
      {rx:1, body:'Loaded and rolling. Seal 448812.', att:'BOL-FF-24839.jpg', meta:'via app', t:'09:41'},
      {sys:1, k:'bad', ic:I.gauge, title:'Speeding alert sent to driver', body:'Above 73 mph for 2 min on I-35 S near Temple · policy Highway sustained v3', meta:'Telegram + app · delivered 11:16:09', t:'11:16'},
      {rx:1, body:'Copy. Slowing down — work zone ahead.', att:'', meta:'via Telegram', t:'11:19'},
      {tx:1, body:'Thanks Jamal. Austin appointment is 15:30 — I’ll update Sysco.', meta:'App + Telegram · read', t:'11:19'},
    ],
    quick:['Call me when stopped','Send a BOL photo','Running late?']};
}

// ---------------------------------------------------------------- overlays
function buildPalette(X) {
  const {c, fin} = X;
  const it = (t, s, ic, go, badge, k, kbd, on) => ({t, s, ic, go, badge:badge || '', k:k || '', kbd:kbd || '', on:on || ''});
  return {groups:[
    {l:'Loads', items:[
      it('FF-24817','Fort Worth → Oklahoma City · Walmart Transportation', I.loads, () => c.open('FF-24817'), 'In transit','transit','','on'),
      it('FF-24839','Lewisville → Austin · Sysco North Texas', I.loads, () => c.open('FF-24839'), 'In transit','transit'),
      it('FF-24851','Waxahachie → Shreveport · Owens Corning', I.loads, () => c.open('FF-24851'), 'Planned','planned'),
      it('FF-24828','Irving → Little Rock · Georgia-Pacific', I.loads, () => c.open('FF-24828'), 'At pickup','atpickup')]},
    {l:'Documents', items:[it('POD-FF-24782.pdf','Proof of delivery · needs review', I.file, () => c.go('docreview'), 'Review','info')]},
    {l:'Actions', items:[it('Assign a driver to FF-24851','Opens the assignment panel', I.user, () => c.assign(), '', '', 'A'), it('Create a load','Guided form', I.plus, () => c.go('newload'), '', '', 'C'), it('Open Live fleet','Map, alerts and trip history', I.pin, () => c.go('tracking'), '', '', 'G F')]}],
    foot: fin ? 'Only results your role can open are shown' : 'Invoices and rates are hidden for your role'};
}
function buildNotif(X) {
  const {c} = X;
  return [
    {un:'un', k:'bad', ic:I.gauge, t:'Speeding — T-1121', b:'Above 73 mph for 2 min near Temple. Driver alerted on Telegram.', when:'11:16', go:() => c.go('tracking')},
    {un:'un', k:'bad', ic:I.alert, t:'FF-24817 will miss its appointment', b:'ETA 16:40 vs 15:00 at Walmart DC 6094', when:'11:18', go:() => c.open('FF-24817')},
    {un:'un', k:'info', ic:I.msg, t:'Ana Ruiz', b:'“Traffic is stopped at Ardmore, about 30 min.”', when:'11:05', go:() => c.go('messages')},
    {un:'un', k:'brand', ic:I.user, t:'Alex Rivera assigned FF-24870', b:'Kara Nguyen · T-1160 · pickup 15:00', when:'10:41', go:() => c.go('dispatch')},
    {un:'un', k:'ok', ic:I.file, t:'BOL uploaded · FF-24846', b:'Priya Shah · driver app · OCR matched the load', when:'07:31', go:() => c.go('documents')},
    {un:'', k:'warn', ic:I.shield, t:'Medical card expires in 6 days', b:'Marcus Bell · reminder sent on Telegram', when:'08:00', go:() => c.driver('Marcus Bell')},
  ];
}
function buildAI(X) {
  const {c, fin} = X;
  const s = (l, ic, go) => ({l, ic, go});
  return {uses:'Loads, Dispatch, Tracking, Alerts, Messages', hidden: fin ? '' : 'Finance, rates', draft:true,
    items:[
      {n:'1', t:'FF-24851 has no driver and picks up at 14:00 in Waxahachie. Ben Okafor is the closest qualified driver — 6 mi away and free all day.', src:[s('FF-24851', I.loads, () => c.assign()), s('Ben Okafor', I.user, () => c.driver('Ben Okafor'))]},
      {n:'2', t:'FF-24817 will miss its 15:00 Walmart appointment by about 1h 40m (ETA 16:40). The customer hasn’t been told — a draft update is below.', src:[s('FF-24817', I.loads, () => c.open('FF-24817'))]},
      {n:'3', t:'T-1121 (Jamal Carter) triggered a speeding incident at 11:16. He replied on Telegram, but nobody has acknowledged it in FlyFleet.', src:[s('SPD-0412', I.gauge, () => c.go('tracking')), s('Chat', I.msg, () => c.go('messages'))]}],
    sugg:['Which drivers are free after 15:00?','Summarize this morning’s exceptions','What’s blocking invoicing today?']};
}

// ---------------------------------------------------------------- auth, portal, states
function buildAuth(X) {
  const {c, step} = X;
  return {form: step === 'signin', org: step !== 'signin', next:() => c.set({step:'org'}), back:() => c.set({step:'signin'}),
    orgs:[
      {n:'Lone Star Freight', ini:'LS', c:'#E8A317', d:'Main Admin · 42 drivers', cls:'on', inv:0, acts:[{l:'Continue', cls:'pri', go:() => c.go('dashboard')}]},
      {n:'Red River Logistics', ini:'RR', c:'#9B87F5', d:'Dispatcher · 18 drivers', cls:'', inv:0, acts:[{l:'Open', cls:'', go:noop}]},
      {n:'Keystone Haulers', ini:'KH', c:'#4FC08D', d:'Accounting · invited by Joe Park · expires in 5 days', cls:'inv', inv:1, acts:[{l:'Decline', cls:'ghost', go:noop}, {l:'Accept', cls:'', go:noop}]}]};
}
function buildPortal() {
  return {
    list:[
      {id:'FF-24817', po:'PO 71904', lane:'Fort Worth, TX → Oklahoma City, OK', when:'Delivery today · ETA 16:40 (appt 15:00)', st:'In transit', k:'transit', on:'on'},
      {id:'FF-24870', po:'PO 71988', lane:'Dallas, TX → Abilene, TX', when:'Pickup today 15:00 · delivery 20:30', st:'Scheduled', k:'assigned', on:''},
      {id:'FF-24744', po:'PO 71822', lane:'Fort Worth, TX → Tulsa, OK', when:'Delivered Nov 10 · 13:52 · POD available', st:'Delivered', k:'delivered', on:''},
      {id:'FF-24701', po:'PO 71760', lane:'Dallas, TX → Oklahoma City, OK', when:'Delivered Nov 6 · 14:31 · POD available', st:'Delivered', k:'delivered', on:''}],
    miles:[{l:'Booked', t:'Nov 12', st:'done', done:1}, {l:'Picked up', t:'07:05', st:'done', done:1}, {l:'In transit', t:'ETA 16:40', st:'cur', done:0}, {l:'Delivered', t:'', st:'', done:0}]};
}

// ---------------------------------------------------------------- roles & navigation
// deny = modules this role can't open. The server enforces the same rules; the UI only mirrors them.
const ROLES = {
  owner:{label:'Main Admin', who:'Dana Kim', ini:'DK', email:'dana.kim@lonestarfreight.com', fin:true, deny:['platform']},
  ops:{label:'Operations Manager', who:'Dana Kim', ini:'DK', email:'dana.kim@lonestarfreight.com', fin:true, deny:['platform']},
  dispatcher:{label:'Dispatcher', who:'Jordan Lee', ini:'JL', email:'jordan.lee@lonestarfreight.com', fin:false, deny:['safety','inspections','invoices','settlements','fuel','team','settings','audit','platform']},
  safety:{label:'Safety Manager', who:'Rosa Delgado', ini:'RD', email:'rosa.delgado@lonestarfreight.com', fin:false, deny:['dispatch','invoices','settlements','fuel','team','settings','audit','platform']},
  accounting:{label:'Accounting', who:'Mei Chen', ini:'MC', email:'mei.chen@lonestarfreight.com', fin:true, deny:['dispatch','tracking','alerts','safety','inspections','maintenance','team','settings','audit','platform']},
  fleet:{label:'Fleet Manager', who:'Owen Brooks', ini:'OB', email:'owen.brooks@lonestarfreight.com', fin:false, deny:['customers','invoices','settlements','fuel','safety','team','settings','audit','platform']},
  platform:{label:'Platform Operator', who:'FlyFleet Support', ini:'FS', email:'support@flyfleet.io', fin:false, deny:[]},
  // external: an equipment owner signs in to the owner portal only, scoped to the equipment they own
  eqowner:{label:'Equipment owner', who:'Hector Castillo', ini:'HC', email:'', fin:true, deny:['dashboard','tasks','dispatch','loads','tracking','alerts','messages','customers','drivers','owners','safety','inspections','documents','trucks','trailers','maintenance','invoices','settlements','fuel','reports','team','settings','audit','platform']},
};
const MODULE_OF = {load:'loads', newload:'loads', driver:'drivers', owner:'owners', ownerform:'owners', stmt:'settlements', truck:'trucks', docreview:'documents', policy:'settings', teams:'team'};
const PERM = {dashboard:'dashboard.read', tasks:'tasks.read', dispatch:'dispatch.board.read', loads:'loads.read', tracking:'tracking.live.read', alerts:'fleet.alerts.read', messages:'messages.read',
  customers:'customers.read', drivers:'drivers.read', owners:'directory.owners.read', trucks:'fleet.trucks.read', trailers:'fleet.trailers.read', safety:'compliance.records.read', inspections:'compliance.inspections.read', documents:'documents.read', maintenance:'maintenance.read',
  invoices:'finance.invoices.read', settlements:'finance.statements.read', fuel:'finance.fuel.read', reports:'reports.read', team:'users.manage', settings:'organization.settings.manage', audit:'audit.read', platform:'platform.support'};
const NAV = [
  {label:'Overview', items:[['dashboard','Dashboard','dash'],['tasks','My tasks','tasks','6']]},
  {label:'Operations', items:[['dispatch','Dispatch board','dispatch'],['loads','Loads','loads'],['tracking','Live fleet','pin'],['alerts','Fleet alerts','alert','9',1],['messages','Messages','msg','3']]},
  {label:'Directory', items:[['customers','Customers','building'],['drivers','Drivers','user'],['owners','Owners','owner']]},
  {label:'Safety & fleet', items:[['safety','Compliance','shield','6'],['inspections','Inspections','inspect','2'],['documents','Documents','file','4'],['trucks','Trucks','truck'],['trailers','Trailers','trailer'],['maintenance','Maintenance','wrench']]},
  {label:'Finance', items:[['invoices','Invoices','invoice'],['settlements','Statements','dollar'],['fuel','Fuel & IFTA','fuel']]},
  {label:'Analytics', items:[['reports','Reports','chart']]},
  {label:'Administration', items:[['team','Team & access','team'],['settings','Settings','sliders'],['audit','Audit log','history']]},
];
const PNAV = [{label:'Platform', items:[['platform','Organizations','globe','3'],['platform2','Support sessions','key','1'],['platform3','Platform health','zap'],['platform4','SaaS billing','dollar']]}];
const LIST_SCREENS = ['tasks','alerts','customers','drivers','owners','trucks','trailers','inspections','documents','invoices','settlements','audit','platform'];
// ---------------------------------------------------------------- add (photo or manual) & spreadsheet import
const ADD = {
  driver:{title:'Add a driver', plural:'drivers', ic:'user', doc:'cdl', mod:'drivers', cta:'Create driver',
    photoT:'Scan the CDL', photoD:'Take or upload a photo of the commercial driver license. We read it and fill in the profile; you check every field before anything is saved.',
    reads:['Name','License #','Class','Endorsements','Expiry'], manualD:'Type the driver’s name, license and hire details into the form yourself.',
    slots:[['Front of the CDL','Required'],['Back of the CDL','Optional · endorsements and restrictions']],
    tips:['Lay the card flat with all four corners in the frame','Tilt away from overhead lights so there’s no glare','Front first; the back helps with endorsements'],
    alt:'Drivers can also scan their own CDL in the driver app after you invite them.', done:'Carlos Medina added · qualification file started'},
  truck:{title:'Add a truck', plural:'trucks', ic:'truck', doc:'reg', mod:'trucks', cta:'Create truck',
    photoT:'Scan the registration', photoD:'A photo or PDF of the cab card. We read the VIN, plate and expiry, then decode the VIN to double-check the year, make and model.',
    reads:['VIN','Plate','Year · make · model','Expiry'], manualD:'Type the unit number, VIN, plate and service details into the form yourself.',
    slots:[['Registration or cab card','Photo or PDF']],
    tips:['Get the whole card in the frame, VIN included','Avoid glare on the plastic sleeve','A PDF from the state portal reads best'],
    alt:'The registration is saved to the truck’s documents and its expiry gets a reminder.', done:'T-1188 added · map it to a telematics device next'},
  trailer:{title:'Add a trailer', plural:'trailers', ic:'trailer', doc:'reg', mod:'trailers', cta:'Create trailer',
    photoT:'Scan the registration', photoD:'A photo or PDF of the trailer registration. We read the VIN, plate and expiry and decode the VIN for the type and year.',
    reads:['VIN','Plate','Type · year','Expiry'], manualD:'Type the unit number, type, VIN and plate into the form yourself.',
    slots:[['Trailer registration','Photo or PDF']],
    tips:['Get the whole document in the frame, VIN included','Avoid glare and shadows across the text','A PDF from the state portal reads best'],
    alt:'The registration is saved to the trailer’s documents and its expiry gets a reminder.', done:'TR-5344 added to Trailers'},
  load:{title:'New load', plural:'loads', ic:'loads', doc:'rate', mod:'loads', cta:'Create draft load',
    photoT:'From a rate confirmation', photoD:'Upload the rate con PDF or snap a photo. We fill in the customer, reference, stops, appointments and rate; the load starts as a draft.',
    reads:['Customer','Reference','Stops','Appointments','Rate'], manualD:'Use the guided form for the customer, stops, rate and documents.',
    slots:[['Rate confirmation','PDF, photo or screenshot']],
    tips:['PDFs straight from the email read best','For photos, get the whole page, flat and in good light','Add every page of a multi-page rate con'],
    alt:'Tip: forward rate confirmations to loads@lonestar.flyfleet.io and they arrive here as drafts.', done:'Draft FF-24891 created from the rate confirmation'},
  invoice:{title:'New invoice', plural:'invoices', ic:'invoice', doc:'pod', mod:'invoices', cta:'Create draft invoice',
    photoT:'From a POD or rate confirmation', photoD:'Scan the signed POD or the rate con. We match the load and fill in line haul, fuel surcharge and accessorials for you to check.',
    reads:['Load match','Line haul','Fuel surcharge','Detention'], manualD:'Pick the customer and loads, then enter the charges yourself.',
    slots:[['POD or rate confirmation','PDF or photo']],
    tips:['Include the signature and the in and out times','One document per load works best','For photos, get the whole page, flat and in good light'],
    alt:'Invoices stay drafts until you issue them. Nothing is sent to the customer yet.', done:'Draft INV-10514 created for Owens Corning'},
};
const rf = (l, v, conf, k, st, o) => ({l, v, conf, k, st, mono:(o && o.mono) ? 'mono' : '', note:(o && o.note) || '', ph:(o && o.ph) || '', money:!!(o && o.money),
  cls: k === 'warn' ? 'lo' + ((o && o.sel) ? ' sel' : '') : '', ic: k === 'ok' ? I.check : (k === 'warn' ? I.alert : I.pencil), hasConf:!!conf, pct:conf || '0%'});
const REVIEW = {
  driver:{file:'cdl_front.jpg + cdl_back.jpg', meta:'Read in 2.1 s · 2 photos', lineage:'Edges found · perspective corrected · glare reduced. The original photos are kept in the qualification file.',
    banner:{k:'ok', t:'No duplicate.', d:'No driver at Lone Star Freight has this CDL number.'},
    fields:[rf('Full name','Carlos A. Medina','99%','ok','Read'), rf('CDL number','41208837','98%','ok','Read',{mono:1}), rf('State · class','Texas · Class A','99%','ok','Read'),
      rf('Endorsements','N, H','74%','warn','Check',{note:'The H sits under glare. Check it against the card; hazmat decides which loads he can take.', sel:1}),
      rf('Restrictions','None','95%','ok','Read'), rf('CDL expires','Jun 14, 2030','97%','ok','Read',{mono:1}),
      rf('Date of birth','06/14/1988','96%','ok','Encrypted',{mono:1, note:'Stored encrypted and hidden after saving.'}),
      rf('Mobile phone','','','mu','Add',{mono:1, ph:'(214) 555-0100', note:'Not on the CDL. Add it to text him the app invite.'})],
    after:{t:'Still needed before dispatch', items:[['Medical certificate','warn'],['MVR annual review','warn'],['Drug & alcohol clearinghouse query','warn'],['Pre-employment drug test','warn']], d:'We’ll request these by text and add them to the Compliance review queue.'}},
  truck:{file:'registration_T1188.pdf', meta:'Read in 1.4 s · 1 page', lineage:'Text read straight from the PDF; no image cleanup needed. The original is kept in the truck’s documents.',
    banner:{k:'ok', t:'VIN decoded.', d:'2023 Freightliner Cascadia 126, matching what’s printed on the card.'},
    reg:{plate:'S9K 4416', exp:'11/30/27', vin:'3AKJHHDR5PSNA4417', year:'2023', make:'FRHT', model:'CASCADIA 126 · TRACTOR', gvwr:'80,000', owner:'LONE STAR FREIGHT LLC · DALLAS TX', expLo:'lo sel', plateLo:''},
    fields:[rf('Unit number','T-1188','','mu','Suggested',{mono:1, note:'The next free number. Change it if your trucks are numbered differently.'}), rf('VIN','3AKJHHDR5PSNA4417','99%','ok','Valid',{mono:1}),
      rf('Year · make · model','2023 Freightliner Cascadia 126','98%','ok','Matches VIN'), rf('Plate · state','S9K 4416 · Texas','97%','ok','Read',{mono:1}),
      rf('Registered owner','Lone Star Freight LLC','95%','ok','Read'), rf('GVWR','80,000 lb','93%','ok','Read',{mono:1}),
      rf('Registration expires','Nov 30, 2027','68%','warn','Check',{note:'Printed with a two-digit year (11/30/27). We read it as 2027; a reminder goes out 60 days before.', sel:1})],
    after:{t:'After saving', items:[['Map it to a telematics device so it shows on Live fleet','info'],['Upload the annual DOT inspection','info']], d:''}},
  trailer:{file:'registration_TR5344.jpg', meta:'Read in 1.8 s · 1 photo', lineage:'Edges found · perspective corrected. The original photo is kept in the trailer’s documents.',
    banner:{k:'ok', t:'VIN decoded.', d:'2024 Utility 3000R, a 53’ refrigerated van.'},
    reg:{plate:'1XL 5344', exp:'08/31/2027', vin:'1UYVS2539RU712205', year:'2024', make:'UTIL', model:'3000R · REFRIGERATED VAN', gvwr:'68,000', owner:'LONE STAR FREIGHT LLC · DALLAS TX', expLo:'', plateLo:'lo sel'},
    fields:[rf('Unit number','TR-5344','','mu','Suggested',{mono:1, note:'The next free trailer number.'}), rf('VIN','1UYVS2539RU712205','99%','ok','Valid',{mono:1}),
      rf('Type · length','Reefer · 53’','97%','ok','From VIN'), rf('Year · make','2024 Utility 3000R','98%','ok','Matches VIN'),
      rf('Plate · state','1XL 5344 · Texas','81%','warn','Check',{mono:1, note:'The 5 could be an S. Check it against the plate before saving.', sel:1}),
      rf('Registration expires','Aug 31, 2027','97%','ok','Read',{mono:1})],
    after:{t:'After saving', items:[['Pair the reefer unit with telematics to track temperature','info'],['Upload the annual inspection','info']], d:''}},
  load:{file:'GP_rate_confirmation_31044.pdf', meta:'Read in 2.6 s · 2 pages', lineage:'Text read from the PDF, plus image reading where a stamp covers the print. The rate con is attached to the load.',
    banner:{k:'ok', t:'Customer found.', d:'Georgia-Pacific. Reference PO 31044 is new for this customer.'},
    fields:[rf('Customer','Georgia-Pacific','99%','ok','Matched'), rf('Reference','PO 31044','98%','ok','Read',{mono:1}),
      rf('Pickup','GP Irving Mill · Irving, TX','97%','ok','Matched'), rf('Pickup window','Nov 16 · 07:00–09:00','96%','ok','Read',{mono:1}),
      rf('Delivery','GP Little Rock DC · Little Rock, AR','97%','ok','Matched'),
      rf('Delivery appointment','Nov 16 · 17:00','66%','warn','Check',{mono:1, note:'A stamp overlaps the time. Confirm 17:00 against the document.', sel:1}),
      rf('Equipment · weight','53’ dry van · 41,800 lb','95%','ok','Read'), rf('Line haul','$1,840.00','99%','ok','Read',{mono:1, money:1}), rf('Fuel surcharge','$221.00','98%','ok','Read',{mono:1, money:1})],
    after:{t:'When you save', items:[['Saved as draft FF-24891 with the rate con attached','info'],['Assign a driver from the dispatch board','info']], d:''}},
  invoice:{file:'POD_FF-24775.jpg', meta:'Read in 2.2 s · 1 photo', lineage:'Edges found · deskewed 1.4°. The POD is attached to the invoice and to the load.',
    banner:{k:'ok', t:'Matched FF-24775.', d:'Owens Corning · BOL 55031 · delivered Nov 11 at Builders FirstSource, El Paso.'},
    fields:[rf('Customer','Owens Corning','99%','ok','Matched'), rf('Load · PO','FF-24775 · PO 88120','99%','ok','Matched',{mono:1}),
      rf('Delivered','Nov 11 · 10:42','94%','ok','Read',{mono:1}), rf('Time on site','06:40 – 09:10 · 2 h 30 m','88%','ok','Read',{mono:1}),
      rf('Signed by','M. Ortiz','71%','warn','Check',{note:'Handwritten. Leave it as read or mark it unreadable; never guess a name.', sel:1})],
    lines:[['Line haul','$2,980.00'],['Fuel surcharge · 12%','$357.60'],['Detention · 30 min past 2 h free','$37.50']], total:'$3,375.10', terms:'Net 30 · due Dec 14',
    after:{t:'When you save', items:[['Saved as draft INV-10514; issue it from Invoices','info'],['The POD is filed with the load’s documents','info']], d:''}},
};
const mf = (l, v, span, o) => ({l, v:v || '', span:String(span || 2), ph:(o && o.ph) || '', mono:(o && o.mono) ? 'mono' : '', hint:(o && o.hint) || '', opts:(o && o.opts) || null, on:(o && o.on) || ''});
const MANUAL = {
  driver:{groups:[
    ['Driver', [mf('First name','',3), mf('Last name','',3), mf('Mobile phone','',3,{ph:'(214) 555-0100', mono:1}), mf('Email','',3,{ph:'name@example.com'})]],
    ['License', [mf('CDL number','',2,{mono:1}), mf('State','Texas',2), mf('Class','',2,{opts:['A','B','C'], on:'A'}), mf('Endorsements','',2,{ph:'e.g. N, H'}), mf('CDL expires','',2,{ph:'MM/DD/YYYY', mono:1}), mf('Medical card expires','',2,{ph:'MM/DD/YYYY', mono:1})]],
    ['Employment', [mf('Hire date','',2,{ph:'MM/DD/YYYY', mono:1}), mf('Employee ID','D-1119',2,{mono:1, hint:'The next free ID'}), mf('Pay basis','',2,{opts:['Per mile','% of load','Hourly'], on:'Per mile'})]]],
    toggle:'Text an invite to the FlyFleet driver app'},
  truck:{groups:[
    ['Unit', [mf('Unit number','T-1188',2,{mono:1, hint:'The next free number'}), mf('VIN','',4,{mono:1, ph:'17 characters'}), mf('Year','',2,{mono:1}), mf('Make','',2), mf('Model','',2)]],
    ['Registration', [mf('Plate','',2,{mono:1}), mf('State','Texas',2), mf('Registration expires','',2,{ph:'MM/DD/YYYY', mono:1})]],
    ['Service', [mf('Odometer','',2,{ph:'Miles', mono:1}), mf('Annual inspection due','',2,{ph:'MM/DD/YYYY', mono:1}), mf('Telematics device','',2,{ph:'Samsara ID'})]]],
    toggle:''},
  trailer:{groups:[
    ['Unit', [mf('Unit number','TR-5344',2,{mono:1, hint:'The next free number'}), mf('Type','',4,{opts:['Dry van','Reefer','Flatbed'], on:'Dry van'}), mf('Length','53’',2), mf('VIN','',4,{mono:1, ph:'17 characters'})]],
    ['Registration', [mf('Year','',2,{mono:1}), mf('Make','',2), mf('Plate','',2,{mono:1}), mf('State','Texas',2), mf('Registration expires','',2,{ph:'MM/DD/YYYY', mono:1}), mf('Annual inspection due','',2,{ph:'MM/DD/YYYY', mono:1})]]],
    toggle:''},
  invoice:{groups:[
    ['Bill to', [mf('Customer','Owens Corning',3), mf('Invoice date','Nov 14, 2026',3), mf('Terms','',6,{opts:['Net 15','Net 30','Net 45'], on:'Net 30'})]],
    ['Loads', [mf('Loads on this invoice','FF-24775',6,{mono:1, hint:'Delivered loads with a reviewed POD'})]]],
    lines:[['Line haul','$2,980.00'],['Fuel surcharge · 12%','$357.60']], total:'$3,337.60', terms:'Net 30 · due Dec 14', toggle:''},
};
const IMPORT = {
  driver:{file:'lonestar_drivers.xlsx', ext:'XLSX', meta:'Sheet 1 · 24 rows · 11 columns', rows:'24',
    tmpl:'Columns already named the way FlyFleet reads them: name, phone, CDL number, state, class, endorsements and expiry dates.',
    note:'The first row must be column names. Dates like 03/14/2029 or 2029-03-14 both work. License numbers and birth dates are encrypted as they’re imported.',
    mapT:'10 of 11 columns matched.', mapD:'Every required field is covered: name, phone, CDL number, state, class and expiry.',
    cols:[['Driver Name','Carlos Medina','Full name → first and last','ok','Matched'],['Cell','(214) 555-0172','Mobile phone','ok','Matched'],['Email','cmedina@…','Email','ok','Matched'],['CDL #','41208837','CDL number','ok','Matched'],['St','TX','CDL state','ok','Matched'],['Class','A','CDL class','ok','Matched'],['End.','N H','Endorsements','ok','Matched'],['CDL Exp','06/14/2030','CDL expiration','ok','MM/DD/YYYY'],['Med Card','8/2/27','Medical card expiration','warn','2-digit years → 2027'],['Hire Date','2024-09-03','Hire date','ok','Matched'],['Notes','Prefers nights','Don’t import','mu','Ignored']],
    sum:[['Ready','20','ok','will be added'],['Need a look','3','warn','choose below'],['Can’t import','1','bad','fix in your file']],
    iss:[['7','Devon Price','Already in FlyFleet with the same CDL number','warn',['Update','Skip'],'Update'],['12','Luis Ortega','Already in FlyFleet with the same CDL number','warn',['Update','Skip'],'Update'],['15','Andre Collins','CDL expiration “13/45/2027” isn’t a date','bad',null,'Fix in file'],['19','Maya Brooks','Medical card expired Oct 2, 2026; she’d be added as not dispatchable','warn',['Add anyway','Skip'],'Add anyway']],
    opts:['Text each new driver an invite to the app','Start qualification files and request missing documents'], cta:'Import 23 drivers',
    doneT:'23 drivers imported', doneD:'Qualification files are started and missing documents were requested by text.', doneRows:[['Added','21','ok'],['Updated · Devon Price, Luis Ortega','2','info'],['Skipped · row 15, fix the date and import it again','1','bad']], view:'drivers'},
  truck:{file:'trucks_2026.csv', ext:'CSV', meta:'12 rows · 10 columns', rows:'12',
    tmpl:'Columns for unit number, VIN, year, make, model, plate, state, odometer and expiry dates.',
    note:'The first row must be column names. VINs are checked and decoded on import, and telematics IDs are matched to your Samsara account.',
    mapT:'9 of 10 columns matched.', mapD:'Every required field is covered: unit number, VIN and plate.',
    cols:[['Unit #','1188','Unit number','ok','Adds the T- prefix'],['VIN','3AKJHHDR5PSNA4417','VIN','ok','Matched'],['Yr','2023','Year','ok','Matched'],['Make','Freightliner','Make','ok','Matched'],['Model','Cascadia','Model','ok','Matched'],['Plate','S9K 4416','Plate','ok','Matched'],['Plate St','TX','Plate state','ok','Matched'],['Odometer','128,402','Odometer · miles','ok','Matched'],['Reg Exp','11/30/27','Registration expires','warn','2-digit years → 2027'],['Color','White','Don’t import','mu','Ignored']],
    sum:[['Ready','9','ok','will be added'],['Need a look','2','warn','choose below'],['Can’t import','1','bad','fix in your file']],
    iss:[['3','T-1121','Already in FlyFleet with the same VIN','warn',['Update','Skip'],'Update'],['8','T-1190','VIN fails the check digit; an I may be a 1','bad',null,'Fix in file'],['11','T-1193','Samsara ID not found in your Samsara account','warn',['Add without','Skip'],'Add without']],
    opts:['Create inspection and registration reminders'], cta:'Import 11 trucks',
    doneT:'11 trucks imported', doneD:'Registration reminders are set. One truck still needs a telematics device.', doneRows:[['Added','10','ok'],['Updated · T-1121','1','info'],['Skipped · row 8, check the VIN and import it again','1','bad']], view:'trucks'},
  trailer:{file:'trailers.xlsx', ext:'XLSX', meta:'Sheet 1 · 18 rows · 9 columns', rows:'18',
    tmpl:'Columns for unit number, type, length, VIN, year, make, plate, state and expiry dates.',
    note:'The first row must be column names. Types can be words or codes: DV, RF and FB are read as dry van, reefer and flatbed.',
    mapT:'9 of 9 columns matched.', mapD:'Every required field is covered: unit number, type and VIN.',
    cols:[['Trailer','5344','Unit number','ok','Adds the TR- prefix'],['Type','DV','Type','warn','DV → Dry van, RF → Reefer'],['Length','53','Length · ft','ok','Matched'],['VIN','1UYVS2539RU712205','VIN','ok','Matched'],['Year','2024','Year','ok','Matched'],['Make','Utility','Make','ok','Matched'],['Plate','1XL 5344','Plate','ok','Matched'],['State','TX','Plate state','ok','Matched'],['Reg. Exp.','2027-08-31','Registration expires','ok','Matched']],
    sum:[['Ready','16','ok','will be added'],['Need a look','1','warn','choose below'],['Can’t import','1','bad','fix in your file']],
    iss:[['5','TR-5301','Already in FlyFleet with the same VIN','warn',['Update','Skip'],'Update'],['14','TR-5361','Type “CONT” isn’t a trailer type FlyFleet knows','bad',null,'Fix in file']],
    opts:['Create inspection and registration reminders'], cta:'Import 17 trailers',
    doneT:'17 trailers imported', doneD:'Inspection and registration reminders are set for every new trailer.', doneRows:[['Added','16','ok'],['Updated · TR-5301','1','info'],['Skipped · row 14, set a type and import it again','1','bad']], view:'trailers'},
};
const CREATE = [['load','New load','From a rate confirmation or by hand','loads','loads'],['driver','Add a driver','Scan a CDL, type it in or import','user','drivers'],['truck','Add a truck','Scan the registration or type it in','truck','trucks'],['trailer','Add a trailer','Scan the registration or type it in','trailer','trailers'],['inspection','Log an inspection','Scan the roadside report or type it in','inspect','inspections'],['invoice','New invoice','From a POD, or pick the loads yourself','invoice','invoices']];

// ---------------------------------------------------------------- inspections, fuel receipts (photo or manual)
Object.assign(ADD, {
  inspection:{title:'Log an inspection', plural:'inspections', ic:'inspect', doc:'insp', mod:'inspections', cta:'Save inspection',
    photoT:'Scan the inspection report', photoD:'A photo or PDF of the roadside inspection report. We read the level, every violation code and any out-of-service order, then match the driver, truck and trailer.',
    reads:['Level','Violation codes','Out of service','Driver & units','Severity'], manualD:'Type the report number, level and violation codes yourself.',
    slots:[['Inspection report','Every page · photo or PDF']],
    tips:['Include every page; violations often continue on page 2','Flat, in good light, with the violation codes in focus','A PDF from the inspector’s email reads best'],
    alt:'Inspections also arrive from FMCSA each month. A scanned report is matched to that record, so nothing is counted twice.', done:'Inspection TX-26-0417 saved · repairs to certify by Nov 27'},
  fuel:{title:'Add a fuel receipt', plural:'fuel receipts', ic:'fuel', doc:'rcpt', mod:'fuel', cta:'Save purchase',
    photoT:'Scan the receipt', photoD:'Snap the pump receipt. We read the station, gallons, price and total, then match the truck from where it was at that time.',
    reads:['Station','Gallons','Price per gallon','Total','Truck'], manualD:'Type the station, gallons and amount yourself.',
    slots:[['Fuel receipt','Photo or PDF']],
    tips:['The whole receipt in the frame, flat and in good light','Thermal paper fades, so scan it the same day','One receipt per photo'],
    alt:'Card purchases from WEX arrive on their own. Scan receipts for cash or any other card.', done:'Fuel purchase saved · added to Sam Whitfield’s statement as a reimbursement'},
});
Object.assign(REVIEW, {
  inspection:{file:'inspection_TX-26-0417.jpg + 1 more', meta:'Read in 3.4 s · 2 photos', lineage:'Edges found · perspective corrected · both pages read. The original photos are kept with the inspection.',
    banner:{k:'bad', t:'3 violations, 1 out of service.', d:'Both pages read and matched to Jamal Carter, T-1121 and TR-5301. One code needs a check.'},
    fields:[rf('Report number','TX-26-0417','99%','ok','Read',{mono:1}), rf('Date · time','Nov 12 · 14:20 – 15:05','97%','ok','Read',{mono:1}),
      rf('Location','I-35E NB weigh station · Hillsboro, TX','95%','ok','Read'), rf('Driver','Jamal Carter','99%','ok','Matched by license'),
      rf('Unit 1 · truck','T-1121 · Kenworth T680','99%','ok','Matched by VIN'), rf('Unit 2 · trailer','TR-5301 · Utility 3000R','96%','ok','Matched by plate')],
    after:{t:'What happens next', items:[
      ['Out-of-service order cleared: the TR-5301 tire was replaced roadside Nov 12 at 16:05','ok'],
      ['Brake adjustment on T-1121 added to WO-1182, opened from this morning’s DVIR','warn'],
      ['Lamp on TR-5301 added to WO-1184','warn'],
      ['Certify the repairs on the report by Nov 27 (15 days) and keep it 12 months; send it to the state only if asked','info'],
      ['Jamal Carter has no driver violations, so nothing goes on his file','ok'],
      ['Vehicle Maintenance BASIC moves from about 61% to 64%, still under the 80% alert','mu'],
      ['Disagree with a violation? Start a DataQs request with these photos attached','mu']], d:''}},
  fuel:{file:'receipt_waco_0802.jpg', meta:'Read in 1.6 s · 1 photo', lineage:'Edges found · perspective corrected · contrast raised for faded thermal paper. The original photo is kept with the purchase.',
    banner:{k:'ok', t:'Truck matched.', d:'T-1102 was at this station from 07:51 to 08:09, on load FF-24866.'},
    fields:[rf('Station','Travel center #432 · Waco, TX','68%','warn','Check',{note:'The store number is faded: #432 or #482. Only #432 is on this route, so we picked it.', sel:1}),
      rf('Date · time','Nov 12 · 08:02','97%','ok','Read',{mono:1}), rf('Fuel','Diesel #2 · 88.214 gal','98%','ok','Read',{mono:1}),
      rf('Price per gallon','$3.849','95%','ok','Read',{mono:1, money:1}), rf('Total','$339.53','99%','ok','Matches gallons × price',{mono:1, money:1}),
      rf('Paid with','Cash','96%','ok','Read'), rf('Truck · driver','T-1102 · Sam Whitfield','','ok','Matched by GPS')],
    after:{t:'When you save', items:[['Added to Sam Whitfield’s Nov 9–15 statement as a $339.53 reimbursement','info'],['88.2 gallons counted for Texas in IFTA','info'],['T-1102 MPG updates at its next fill-up','info']], d:''}},
});
Object.assign(MANUAL, {
  inspection:{groups:[
    ['Inspection', [mf('Report number','',2,{mono:1, ph:'e.g. TX-26-0417'}), mf('Date','',2,{ph:'MM/DD/YYYY', mono:1}), mf('State','Texas',2), mf('Level','',6,{opts:['I · Full','II · Walk-around','III · Driver only','V · Vehicle only'], on:'I · Full'})]],
    ['Driver & units', [mf('Driver','',2,{ph:'Search drivers'}), mf('Truck','',2,{mono:1, ph:'T-'}), mf('Trailer','',2,{mono:1, ph:'TR-'})]],
    ['Violations', [mf('Violation code','',2,{mono:1, ph:'e.g. 393.47(e)', hint:'We fill in the description and points'}), mf('Unit','',2,{opts:['Truck','Trailer','Driver'], on:'Truck'}), mf('Out of service','',2,{opts:['No','Yes'], on:'No'})]]],
    toggle:'Add vehicle violations to work orders'},
  fuel:{groups:[
    ['Purchase', [mf('Station','',4,{ph:'Name and city'}), mf('Date · time','',2,{ph:'MM/DD/YYYY HH:MM', mono:1}), mf('Gallons','',2,{mono:1}), mf('Price per gallon','',2,{mono:1, ph:'$'}), mf('Total','',2,{mono:1, ph:'$'})]],
    ['Truck & payment', [mf('Truck','',2,{mono:1, ph:'T-'}), mf('Driver','',2), mf('Paid with','',2,{opts:['Fuel card','Cash','Other'], on:'Cash'})]]],
    toggle:'Reimburse the driver on their statement'},
});
const INSP = {
  sum:[['Level','I · Full inspection'],['Violations','3 · 1 out of service'],['Severity','20 points · ×3 while recent'],['Driver','No driver violations']],
  viol:[
    {code:'393.75(a)(3)', t:'Tire flat or audible air leak', unit:'2', uid:'TR-5301', oos:true, basic:'Vehicle Maintenance', pts:'8 + 2 out of service', conf:'97% read', ck:'ok', link:'Tire replaced roadside Nov 12 · 16:05', lic:'check', note:'', cls:'oos'},
    {code:'393.47(e)', t:'Clamp-type brake out of adjustment', unit:'1', uid:'T-1121', oos:false, basic:'Vehicle Maintenance', pts:'4 points', conf:'98% read', ck:'ok', link:'Same defect as WO-1182, opened from this morning’s DVIR', lic:'wrench', note:'', cls:''},
    {code:'393.9(a)', t:'Inoperable required lamp', unit:'2', uid:'TR-5301', oos:false, basic:'Vehicle Maintenance', pts:'6 points', conf:'74% · check', ck:'warn', link:'', lic:'wrench', note:'The last character is smudged. (a) matches “clearance lamp” in the description.', cls:'lo'}]};

// ---------------------------------------------------------------- dispatch teams: a team sees only its trucks
const TEAMS = {
  A:{key:'A', name:'Team A', c:'#1F4FE0', lead:'Jordan Lee',
    disp:[['Jordan Lee','JL',1],['Alex Rivera','AR',0],['Sofia Park','SP',0],['Nina Cole','NC',0],['Omar Haddad','OH',0]],
    trucks:['1108','1117','1121','1142','1149','1155','1168','1174','1177','1180','1186','1188','1190','1193'], tags:['FF-24851','FF-24873']},
  B:{key:'B', name:'Team B', c:'#0B6E7F', lead:'Marco Diaz',
    disp:[['Marco Diaz','MD',1],['Grace Liu','GL',0],['Tyler Grant','TG',0]],
    trucks:['1102','1129','1133','1138','1160','1163','1171','1176','1183','1184','1189','1191'], tags:['FF-24862','FF-24809','FF-24877']},
};
const EXTRA_DRV = {'1168':'Rafael Gomez','1174':'Dwayne Hill','1177':'Paul Mendez','1180':'Ken Ito & Katie Walsh','1186':'Jerome Banks','1188':'Carlos Medina'};
const inTeam = (team, unit) => !team || team.trucks.includes(String(unit || '').replace(/^T-/, ''));
const loadInTeam = (team, l) => !team || (l.trk ? inTeam(team, l.trk) : team.tags.includes(l.id));

function buildTeams(X) {
  const {c} = X;
  const T = TEAMS.A;
  const drvOf = u => { const d = DRIVERS.find(x => x.t === u); return d ? d.n : (EXTRA_DRV[u] || ''); };
  const cov = [['Team A',14,'brand'],['Team B',12,'teal'],['No team',15,'off']].map(([l, n, k]) => ({l, n:String(n), k, w:(n / 41 * 100).toFixed(2) + '%'}));
  return {
    teams:[{n:'Team A', d:'5 dispatchers · 14 trucks', ini:'A', c:'#1F4FE0', on:'on'}, {n:'Team B', d:'3 dispatchers · 12 trucks', ini:'B', c:'#0B6E7F', on:''}],
    team:{n:T.name, sub:'Lead Jordan Lee · created Nov 3 by Dana Kim · 9 open loads on these trucks'},
    disp:T.disp.map(([n, i, lead]) => ({n, i, lead: !!lead})),
    trucks:T.trucks.map(u => { const dn = drvOf(u); return {u:'T-' + u, d: dn || 'No driver yet', dk: dn ? 't3' : 'mu'}; }),
    can:['Loads on these 14 trucks, plus unassigned loads tagged for Team A','The drivers on these trucks: profiles, documents and messages','Live positions, alerts and trip history for these trucks','Booking and assigning loads, but only to these trucks'],
    cant:['The other 27 trucks and their loads, drivers and alerts','Those trucks in search, the map, exports and notifications','Answers from Ask FlyFleet about trucks outside the team'],
    cov,
    hist:[{who:'Dana Kim', what:'added T-1193 to Team A', when:'Nov 12'}, {who:'Dana Kim', what:'moved Sofia Park from Team B to Team A', when:'Nov 10'}, {who:'Dana Kim', what:'created Team A and Team B', when:'Nov 3'}],
    preview:() => c.preview('A')};
}

function buildModal(X) {
  const {c, fin, modal, kind, mstep} = X;
  const A = ADD[kind] || ADD.driver;
  const btn = (l, cls, go) => ({l, cls:cls || '', go:go || noop});
  const manual = kind === 'load' ? () => c.go('newload') : () => c.mgo('manual');
  const stepper = (labels, at) => labels.map((l, i) => ({l, n:String(i + 1), cls: i < at ? 'done' : (i === at ? 'cur' : ''), cur: i === at ? 'step' : undefined, done: i < at, todo: i >= at}));
  const MD = {title:'', sub:'', ic:I[A.ic], size:'', hasSteps:false, steps:[], left:[], right:[], note:'',
    isChoose:false, isPhoto:false, isReview:false, isManual:false, isUpload:false, isMap:false, isCheck:false, isDone:false, ddCls:''};
  if (modal === 'import') {
    const IM = IMPORT[kind] || IMPORT.driver;
    const at = Math.max(0, ['upload','map','check','done'].indexOf(mstep));
    Object.assign(MD, {title:'Import ' + A.plural, sub:'From a CSV or Excel file', ic:I.sheet, size:'mid', hasSteps:true, steps:stepper(['Upload','Match columns','Review','Done'], at)});
    if (at === 0) {
      Object.assign(MD, {isUpload:true, tmplD:IM.tmpl, upNote:IM.note, pick:() => c.mgo('map')});
      MD.left = [btn('Add one instead','ghost', () => c.add(kind))];
      MD.right = [btn('Cancel','', c.closeModal)];
    } else if (at === 1) {
      Object.assign(MD, {isMap:true, file:IM.file, fileExt:IM.ext, fileMeta:IM.meta, mapT:IM.mapT, mapD:IM.mapD, back:() => c.mgo('upload'),
        mcols:'minmax(0,1fr) minmax(0,1fr) 16px minmax(0,1.3fr) minmax(0,1.15fr)',
        cols:IM.cols.map(([col, sample, field, k, st]) => ({col, sample, field, k, st, aria:'FlyFleet field for ' + col + ': ' + field, ic: k === 'ok' ? I.check : (k === 'warn' ? I.alert : I.deny), scls: k === 'mu' ? 'skip' : (k === 'warn' ? 'warn' : '')}))});
      MD.left = [btn('Back','ghost', () => c.mgo('upload'))];
      MD.right = [btn('Check ' + IM.rows + ' rows','pri', () => c.mgo('check'))];
    } else if (at === 2) {
      Object.assign(MD, {isCheck:true, sum:IM.sum.map(([l, v, k, s]) => ({l, v, k, s})), issN:String(IM.iss.length), opts:IM.opts,
        iss:IM.iss.map(([row, name, issue, k, opts, pick]) => ({row, name, issue, k, ic: k === 'bad' ? I.deny : I.alert, hasOpts:!!opts, fix: opts ? '' : pick, aria:'What to do with row ' + row,
          opts:(opts || []).map(l => ({l, on: l === pick ? 'on' : '', p: l === pick ? 'true' : 'false'}))}))});
      MD.left = [btn('Back','ghost', () => c.mgo('map'))];
      MD.note = 'Nothing is saved until you import';
      MD.right = [btn(IM.cta,'pri', () => c.mgo('done'))];
    } else {
      Object.assign(MD, {isDone:true, doneT:IM.doneT, doneD:IM.doneD, doneRows:IM.doneRows.map(([t, n, k]) => ({t, n, k}))});
      MD.left = [btn('Download error report','')];
      MD.right = [btn('View ' + A.plural,'pri', () => IM.view === 'fuel' ? c.set({screen:'fuel', ftab:1, modal:'none', overlay:'none', drawer:null}) : c.go(IM.view))];
    }
    return MD;
  }
  if (mstep === 'photo') {
    Object.assign(MD, {title:A.photoT, sub:A.title, size:'mid', hasSteps:true, steps:stepper(['Photo','Check','Save'], 0), isPhoto:true,
      slots:A.slots.map(([t, d]) => ({t, d, go:() => c.mgo('review')})), slotCols:'repeat(' + A.slots.length + ',minmax(0,1fr))', tips:A.tips, alt:A.alt});
    MD.left = [btn('Back','ghost', () => c.mgo('choose'))];
    MD.right = [btn('Enter manually instead','', manual)];
  } else if (mstep === 'review') {
    const RV = REVIEW[kind] || REVIEW.driver;
    const fields = RV.fields.filter(f => fin || !f.money).map((f, i) => f.dd ? {...f, ...ddField(f, 'rv.' + kind + '.' + (f.key || i), X), ddsz:'sm', noDd:false} : {...f, isDd:false, noDd:true});
    Object.assign(MD, {title:'Check what we read', sub:A.title + ' · ' + RV.file, size:'wide', hasSteps:true, steps:stepper(['Photo','Check','Save'], 1), isReview:true,
      readMeta:RV.meta, lineage:RV.lineage, banner:RV.banner, fields, finHidden: fields.length < RV.fields.length,
      isCdl: A.doc === 'cdl', isReg: A.doc === 'reg', isRate: A.doc === 'rate', isPod: A.doc === 'pod', isInsp: A.doc === 'insp', isRcpt: A.doc === 'rcpt', reg:RV.reg || {},
      bannerIc: RV.banner.k === 'ok' ? I.check : I.alert, hasInsp: kind === 'inspection', isum:INSP.sum.map(([k, v]) => ({k, v})), violN:String(INSP.viol.length), viol:INSP.viol.map(v => ({...v, lic:I[v.lic]})),
      rc:{lh: fin ? '$1,840.00' : '••••••', fs: fin ? '$221.00' : '••••••', tot: fin ? '$2,061.00' : '••••••'},
      hasLines:!!RV.lines, lines:(RV.lines || []).map(([k, v]) => ({k, v})), total:RV.total || '', terms:RV.terms || '',
      hasAfter:!!RV.after, after: RV.after ? {t:RV.after.t, d:RV.after.d, items:RV.after.items.map(([t, k]) => ({t, k}))} : {t:'', d:'', items:[]}});
    MD.left = [btn('Back','ghost', () => c.mgo('photo')), btn('Retake','', () => c.mgo('photo'))];
    MD.note = 'Your edits are logged next to what was read';
    MD.right = [btn(A.cta,'pri', () => c.created(kind))];
  } else if (mstep === 'manual' && kind !== 'load') {
    const M = MANUAL[kind] || MANUAL.driver;
    Object.assign(MD, {title:A.title, sub:'Enter manually', size:'mid', isManual:true, toggle:M.toggle || '',
      groups:M.groups.map(([l, fs], gi) => ({l, fields:fs.map((f, i) => f.dd ? {...f, id:'mf-' + kind + '-' + gi + '-' + i, ...ddField(f, kind + '.' + (f.key || gi + '-' + i), X), ddsz:''} : ({...f, id:'mf-' + kind + '-' + gi + '-' + i, isInput:!f.opts, isSeg:!!f.opts, isDd:false,
        opts:(f.opts || []).map(o => ({l:o, on: o === f.on ? 'on' : '', p: o === f.on ? 'true' : 'false'}))}))})),
      hasLines:!!M.lines, lines:(M.lines || []).map(([k, v]) => ({k, v})), total:M.total || '', terms:M.terms || ''});
    MD.left = kind === 'mileage' ? [] : [btn('Back','ghost', () => c.mgo('choose'))];
    MD.right = [btn('Cancel','', c.closeModal), btn(A.cta,'pri', () => c.created(kind))];
    MD.ddCls = X.ddOpen && String(X.ddOpen).indexOf(kind + '.') === 0 ? 'ddopen' : '';
  } else {
    Object.assign(MD, {title:A.title, sub:'Start from a document, or type it in.', isChoose:true, bulk: ['driver','truck','trailer'].includes(kind),
      bulkT:'Adding a lot of ' + A.plural + '?', bulkGo:() => c.imp(kind),
      choices:[
        {t:A.photoT, d:A.photoD, ic:I.camera, tag:'Fastest', cls:'rec', reads:A.reads, hasReads:true, go:() => c.mgo('photo')},
        {t:'Enter manually', d:A.manualD, ic:I.pencil, tag:'', cls:'alt', reads:[], hasReads:false, go:manual}]});
    MD.right = [btn('Cancel','', c.closeModal)];
  }
  return MD;
}

// ---------------------------------------------------------------- owner money charts
function buildBiz(X) {
  const {c, hv, tv} = X;
  const k1 = v => '$' + v.toFixed(1) + 'k';
  const view = key => ({showChart:!tv[key], showTable:!!tv[key], c: tv[key] ? '' : 'on', t: tv[key] ? 'on' : '', cp: tv[key] ? 'false' : 'true', tp: tv[key] ? 'true' : 'false',
    chart:() => c.tview(key, false), table:() => c.tview(key, true)});
  const W = [['Aug 25',84.2],['Sep 1',76.9],['Sep 8',88.4],['Sep 15',91.7],['Sep 22',86.3],['Sep 29',94.8],['Oct 6',90.1],['Oct 13',97.6],['Oct 20',93.4],['Oct 27',101.2],['Nov 3',99.8],['Nov 10',61.5]];
  const n = W.length;
  const w = {...view('w'),
    bars:W.map(([l, v], i) => { const key = 'w' + i, last = i === n - 1;
      return {h:(v / 120 * 100).toFixed(2) + '%', cls: last ? 'part' : '', lab: last ? k1(v) + ' so far' : '', tip: hv === key, tv:k1(v), tl:'Week of ' + l + (last ? ' · to date' : ''),
        tcls: i < 2 ? 'start' : (i > n - 3 ? 'end' : ''), aria:'Week of ' + l + ': ' + k1(v) + ' invoiced' + (last ? ' so far' : ''), on:() => c.hover(key)}; }),
    xl:W.map(([l], i) => ({l: [0, 4, 8, 11].includes(i) ? l : ''})),
    rows:W.map(([l, v], i) => ({l: l + (i === n - 1 ? ' (to date)' : ''), v:k1(v)}))};
  const CU = [['Walmart Transportation',48.6],['Home Depot Supply',41.2],['Sysco North Texas',29.8],['PepsiCo Logistics',24.1],['Georgia-Pacific',18.7],['4 other customers',21.8]];
  const ct = CU.reduce((a, x) => a + x[1], 0), mx = Math.max(...CU.map(x => x[1]));
  const cu = {...view('c'), rows:CU.map(([nm, v], i) => ({n:nm, v:k1(v), pct:Math.round(v / ct * 100) + '%', w:(v / mx * 72).toFixed(1) + '%', cls: i === CU.length - 1 ? 'oth' : ''}))};
  const SP = [['Driver pay',148.5,'v1',''],['Fuel',94.9,'v2',''],['Maintenance & tires',33.0,'v3',''],['Insurance',28.9,'v4','dk'],['Other costs',49.5,'v5',''],['Margin',57.8,'v6','']];
  const st = SP.reduce((a, x) => a + x[1], 0);
  const sp = {...view('s'),
    parts:SP.map(([nm, v, col, ink], i) => { const key = 's' + i, pct = Math.round(v / st * 100);
      return {n:nm, f:String(v), v:col, cls:ink, pct:pct + '%', showPct: pct >= 7, amt:k1(v), tip: hv === key, tcls: i === 0 ? 'start' : (i === SP.length - 1 ? 'end' : ''),
        aria:nm + ': ' + k1(v) + ', ' + pct + '% of October revenue', on:() => c.hover(key)}; }),
    rows:SP.map(([nm, v]) => ({n:nm, v:k1(v), pct:Math.round(v / st * 100) + '%'}))};
  return {w, c:cu, s:sp, off:() => c.hover(null)};
}

const LABEL_OF = {};
NAV.concat(PNAV).forEach(g => g.items.forEach(([k, l]) => { LABEL_OF[k] = l; }));

// ---------------------------------------------------------------- dropdown lists: states, makes, trailer types
const STATES = [['Alabama','AL'],['Alaska','AK'],['Arizona','AZ'],['Arkansas','AR'],['California','CA'],['Colorado','CO'],['Connecticut','CT'],['Delaware','DE'],['District of Columbia','DC'],['Florida','FL'],['Georgia','GA'],['Hawaii','HI'],['Idaho','ID'],['Illinois','IL'],['Indiana','IN'],['Iowa','IA'],['Kansas','KS'],['Kentucky','KY'],['Louisiana','LA'],['Maine','ME'],['Maryland','MD'],['Massachusetts','MA'],['Michigan','MI'],['Minnesota','MN'],['Mississippi','MS'],['Missouri','MO'],['Montana','MT'],['Nebraska','NE'],['Nevada','NV'],['New Hampshire','NH'],['New Jersey','NJ'],['New Mexico','NM'],['New York','NY'],['North Carolina','NC'],['North Dakota','ND'],['Ohio','OH'],['Oklahoma','OK'],['Oregon','OR'],['Pennsylvania','PA'],['Rhode Island','RI'],['South Carolina','SC'],['South Dakota','SD'],['Tennessee','TN'],['Texas','TX'],['Utah','UT'],['Vermont','VT'],['Virginia','VA'],['Washington','WA'],['West Virginia','WV'],['Wisconsin','WI'],['Wyoming','WY']];
const TRUCK_MAKES = ['Freightliner','International','Kenworth','Peterbilt','Volvo','Mack','Western Star','Autocar','Ford','Hino','Isuzu','Tesla'];
const TRAILER_MAKES = ['Wabash','Great Dane','Utility','Hyundai Translead','Stoughton','Vanguard','Fontaine','Manac','Kentucky','Wilson','Polar','Heil','Reitnouer','Transcraft','Doonan','Landoll','MAC Trailer','Trail King','XL Specialized','East Manufacturing','Timpte'];
const TRAILER_TYPES = ['Dry van','Reefer','Flatbed','Step deck','Tanker'];
const PRESET_OTHER = {'truck.make':'Other', 'truck.make.o':'Kalmar', 'trailer.type':'Other', 'trailer.type.o':'End dump', 'trailer.make':'Other', 'trailer.make.o':'Ranco'};
I.panelR = 'M3 4h18v16H3zM9 4v16M13 9l3 3-3 3';

// forms: dropdowns for state, make and type; Other → specify
const mf3 = (l, v, span, o) => ({...mf(l, v, span, o), dd:(o && o.dd) || '', key:(o && o.k) || '', other:!!(o && o.other), otherL:(o && o.otherL) || '', otherPh:(o && o.otherPh) || ''});
Object.assign(MANUAL, {
  driver:{groups:[
    ['Driver', [mf3('First name','',3), mf3('Last name','',3), mf3('Mobile phone','',3,{ph:'(214) 555-0100', mono:1}), mf3('Email','',3,{ph:'name@example.com'})]],
    ['License', [mf3('CDL number','',2,{mono:1}), mf3('Issuing state','Texas',2,{dd:'states', k:'state'}), mf3('Class','',2,{opts:['A','B','C'], on:'A'}), mf3('Endorsements','',2,{ph:'e.g. N, H'}), mf3('CDL expires','',2,{ph:'MM/DD/YYYY', mono:1}), mf3('Medical card expires','',2,{ph:'MM/DD/YYYY', mono:1})]],
    ['Employment', [mf3('Hire date','',2,{ph:'MM/DD/YYYY', mono:1}), mf3('Employee ID','D-1119',2,{mono:1, hint:'The next free ID'}), mf3('Pay basis','',2,{opts:['Per mile','% of load','Hourly'], on:'Per mile'})]]],
    toggle:'Text an invite to the FlyFleet driver app'},
  truck:{groups:[
    ['Unit', [mf3('Unit number','T-1188',2,{mono:1, hint:'The next free number'}), mf3('VIN','',4,{mono:1, ph:'17 characters'}), mf3('Year','',2,{mono:1, ph:'2024'}), mf3('Make','',2,{dd:'truckMakes', k:'make', other:1, otherL:'Specify make', otherPh:'Type the make'}), mf3('Model','',2,{ph:'e.g. Cascadia 126'})]],
    ['Registration', [mf3('Plate','',2,{mono:1}), mf3('Plate state','Texas',2,{dd:'states', k:'state'}), mf3('Registration expires','',2,{ph:'MM/DD/YYYY', mono:1})]],
    ['Service', [mf3('Odometer','',2,{ph:'Miles', mono:1}), mf3('Annual inspection due','',2,{ph:'MM/DD/YYYY', mono:1}), mf3('Telematics device','',2,{ph:'Samsara ID'})]]],
    toggle:''},
  trailer:{groups:[
    ['Unit', [mf3('Unit number','TR-5344',2,{mono:1, hint:'The next free number'}), mf3('Type','Dry van',2,{dd:'trailerTypes', k:'type', other:1, otherL:'Specify type', otherPh:'e.g. Car hauler, lowboy, hopper'}), mf3('Length','53’',2), mf3('VIN','',6,{mono:1, ph:'17 characters'})]],
    ['Registration', [mf3('Year','',2,{mono:1, ph:'2024'}), mf3('Make','',2,{dd:'trailerMakes', k:'make', other:1, otherL:'Specify make', otherPh:'Type the make'}), mf3('Model','',2), mf3('Plate','',2,{mono:1}), mf3('Plate state','Texas',2,{dd:'states', k:'state'}), mf3('Registration expires','',2,{ph:'MM/DD/YYYY', mono:1})]],
    ['Service', [mf3('Annual inspection due','',3,{ph:'MM/DD/YYYY', mono:1}), mf3('Tracker','',3,{ph:'Samsara asset tag'})]]],
    toggle:''},
  inspection:{groups:[
    ['Inspection', [mf3('Report number','',2,{mono:1, ph:'e.g. TX-26-0417'}), mf3('Date','',2,{ph:'MM/DD/YYYY', mono:1}), mf3('State','Texas',2,{dd:'states', k:'state'}), mf3('Level','',6,{opts:['I · Full','II · Walk-around','III · Driver only','V · Vehicle only'], on:'I · Full'})]],
    ['Driver & units', [mf3('Driver','',2,{ph:'Search drivers'}), mf3('Truck','',2,{mono:1, ph:'T-'}), mf3('Trailer','',2,{mono:1, ph:'TR-'})]],
    ['Violations', [mf3('Violation code','',2,{mono:1, ph:'e.g. 393.47(e)', hint:'We fill in the description and points'}), mf3('Unit','',2,{opts:['Truck','Trailer','Driver'], on:'Truck'}), mf3('Out of service','',2,{opts:['No','Yes'], on:'No'})]]],
    toggle:'Add vehicle violations to work orders'},
  fuel:{groups:[
    ['Purchase', [mf3('Station','',4,{ph:'Name and city'}), mf3('State','Texas',2,{dd:'states', k:'state'}), mf3('Date · time','',2,{ph:'MM/DD/YYYY HH:MM', mono:1}), mf3('Gallons','',2,{mono:1}), mf3('Price per gallon','',2,{mono:1, ph:'$', hint:'Total = gallons × price'})]],
    ['Truck & payment', [mf3('Truck','',2,{mono:1, ph:'T-'}), mf3('Driver','',2), mf3('Paid with','',2,{opts:['Fuel card','Cash','Other'], on:'Cash'})]]],
    toggle:'Reimburse the driver on their statement'},
  mileage:{groups:[
    ['Trip', [mf3('Truck','T-1163',2,{mono:1}), mf3('Date','11/13/2026',2,{mono:1}), mf3('Load','',2,{mono:1, ph:'Optional'})]],
    ['Miles by state', [mf3('State','Texas',3,{dd:'states', k:'s1'}), mf3('Miles','',3,{mono:1, ph:'0'}), mf3('State','Oklahoma',3,{dd:'states', k:'s2'}), mf3('Miles','',3,{mono:1, ph:'0'})]],
    ['Odometer', [mf3('Start','',3,{mono:1}), mf3('End','',3,{mono:1, hint:'Must match the total miles above'})]]],
    toggle:'Flag this trip as manual on the IFTA return'},
});
// review: state, make and type become dropdowns; short pairs sit side by side
const rf3 = (l, v, conf, k, st, o) => ({...rf(l, v, conf, k, st, o), dd:(o && o.dd) || '', key:(o && o.key) || '', half:(o && o.half) ? 'half' : ''});
const splitRv = (fields, map) => fields.flatMap(f => map[f.l] ? map[f.l] : [f]);
REVIEW.driver.fields = splitRv(REVIEW.driver.fields, {'State · class':[rf3('CDL state','Texas','99%','ok','Read',{dd:'states', key:'state', half:1}), rf3('Class','Class A','99%','ok','Read',{half:1})]});
REVIEW.truck.fields = splitRv(REVIEW.truck.fields, {
  'Year · make · model':[rf3('Year','2023','99%','ok','Matches VIN',{mono:1, half:1}), rf3('Make','Freightliner','98%','ok','Matches VIN',{dd:'truckMakes', key:'make', half:1}), rf3('Model','Cascadia 126','96%','ok','Read')],
  'Plate · state':[rf3('Plate','S9K 4416','97%','ok','Read',{mono:1, half:1}), rf3('Plate state','Texas','98%','ok','Read',{dd:'states', key:'state', half:1})]});
REVIEW.trailer.fields = splitRv(REVIEW.trailer.fields, {
  'Type · length':[rf3('Type','Reefer','97%','ok','From VIN',{dd:'trailerTypes', key:'type', half:1}), rf3('Length','53’','97%','ok','From VIN',{half:1})],
  'Year · make':[rf3('Year','2024','98%','ok','Matches VIN',{mono:1, half:1}), rf3('Make','Utility','98%','ok','Matches VIN',{dd:'trailerMakes', key:'make', half:1}), rf3('Model','3000R','96%','ok','Read')],
  'Plate · state':[rf3('Plate','1XL 5344','81%','warn','Check',{mono:1, note:'The 5 could be an S. Check it against the plate before saving.', sel:1}), rf3('Plate state','Texas','97%','ok','Read',{dd:'states', key:'state'})]});
REVIEW.inspection.fields = splitRv(REVIEW.inspection.fields, {'Location':[rf3('Location','I-35E NB weigh station · Hillsboro','95%','ok','Read'), rf3('State','Texas','99%','ok','Read',{dd:'states', key:'state'})]});
REVIEW.fuel.fields = splitRv(REVIEW.fuel.fields, {'Station':[rf3('Station','Travel center #432 · Waco','68%','warn','Check',{note:'The store number is faded: #432 or #482. Only #432 is on this route, so we picked it.', sel:1}), rf3('State','Texas','96%','ok','From the address',{dd:'states', key:'state'})]});
IMPORT.trailer.note = 'The first row must be column names. Types can be words or codes: DV, RF, FB, SD and TK are read as dry van, reefer, flatbed, step deck and tanker; anything else comes in as Other with your text kept.';
IMPORT.trailer.cols = IMPORT.trailer.cols.map(r => r[0] === 'Type' ? ['Type','DV','Type','warn','DV, RF, FB, SD, TK → types'] : r);
// mileage: manual trips and CSV imports for IFTA
ADD.mileage = {title:'Add a trip', plural:'mileage', ic:'pin', doc:'', mod:'fuel', cta:'Save trip', photoT:'', photoD:'', reads:[], manualD:'', slots:[], tips:[], alt:'',
  done:'Trip saved · miles added to T-1163 for Texas and Oklahoma'};
IMPORT.mileage = {file:'mileage_T1138_nov.csv', ext:'CSV', meta:'31 rows · 7 columns', rows:'31',
  tmpl:'Columns for date, unit, state, odometer start and end, miles and load.',
  note:'For trucks without GPS. One row is one state on one trip; miles are checked against the odometer readings, and imported miles are marked on the return.',
  mapT:'7 of 7 columns matched.', mapD:'Every required field is covered: date, unit, state and miles.',
  cols:[['Date','11/02/2026','Trip date','ok','MM/DD/YYYY'],['Unit','1138','Truck','ok','Adds the T- prefix'],['Jurisdiction','TX','State','ok','Two-letter codes'],['Odo start','498,104','Odometer start','ok','Matched'],['Odo end','498,322','Odometer end','ok','Matched'],['Miles','218','Miles','ok','Matched'],['Load','FF-24702','Load','ok','Matched']],
  sum:[['Ready','29','ok','will be added'],['Need a look','1','warn','choose below'],['Can’t import','1','bad','fix in your file']],
  iss:[['14','T-1138 · Nov 6','Miles (240) don’t match the odometer (226)','warn',['Use odometer','Use miles'],'Use odometer'],['22','T-1138 · Nov 9','“XT” isn’t a US state or Canadian province','bad',null,'Fix in file']],
  opts:['Hold imported miles for review before the return is approved'], cta:'Import 30 rows',
  doneT:'30 trip rows imported', doneD:'Miles are added to T-1138 by state and marked as imported on the Q4 return.', doneRows:[['Added','29','ok'],['Updated · row 14, odometer used','1','info'],['Skipped · row 22, fix the state and import it again','1','bad']], view:'fuel'};

// ---------------------------------------------------------------- Fuel & IFTA
const IFTA = [['Texas','TX',138888,23410,0.20],['Oklahoma','OK',39352,5820,0.19],['Louisiana','LA',23148,2640,0.20],['Arkansas','AR',18518,1180,0.285],['Tennessee','TN',11574,1499,0.27]];
const IFTA_TRUCKS = [
  ['T-1102','Sam Whitfield',[6912,0,1204,0,0],1249,'GPS','ok',I.pin],
  ['T-1108','Ana Ruiz',[4880,3410,0,0,0],1219,'GPS','ok',I.pin],
  ['T-1117','Ben Okafor',[3960,0,0,1980,1214],1022,'GPS','ok',I.pin],
  ['T-1121','Jamal Carter',[7420,610,0,0,0],1217,'GPS','ok',I.pin],
  ['T-1129','Tom Reyes',[6840,1120,0,0,0],1244,'GPS','ok',I.pin],
  ['T-1133','Luis Ortega',[3210,0,980,2450,0],935,'GPS','ok',I.pin],
  ['T-1138','Leah Morgan',[2104,0,1890,0,0],677,'CSV','info',I.sheet],
  ['T-1142','Marcus Bell',[8240,0,610,0,0],1229,'GPS','ok',I.pin],
  ['T-1149','Devon Price',[5020,1340,0,0,0],1010,'38 mi gap','warn',I.alert],
  ['T-1155','Priya Shah',[3980,3860,0,0,0],1136,'GPS','ok',I.pin],
  ['T-1160','Kara Nguyen',[5860,0,0,0,0],803,'GPS','ok',I.pin],
  ['T-1163','No driver',[1210,0,0,0,0],198,'Manual','info',I.pencil],
];
function iftaCalc() {
  const mi = IFTA.reduce((a, x) => a + x[2], 0), gal = IFTA.reduce((a, x) => a + x[3], 0);
  const mpg = Math.round(mi / gal * 100) / 100;
  const rows = IFTA.map(([n, ab, m, paid, rate]) => { const tg = Math.round(m / mpg), net = tg - paid, tax = Math.round(net * rate * 100) / 100; return {n, ab, m, paid, rate, tg, net, tax}; });
  return {mi, gal, mpg, rows, tax: Math.round(rows.reduce((a, r) => a + r.tax, 0) * 100) / 100};
}
function buildFuel(X) {
  const {c, ftab} = X;
  const n0 = v => v.toLocaleString('en-US');
  const IC = iftaCalc();
  const money = v => (v < 0 ? '(' + fm2(-v) + ')' : fm2(v));
  const TABS = [['Purchases','312',''],['Mileage','41',''],['Quarterly returns','','warn'],['Tax rates','8','']];
  const P = [
    ['Nov 13','09:12','WEX ··4417','T-1121','Jamal Carter','Travel center #118','Temple','TX',142.6,3.79,0,'Matched · FF-24839','ok'],
    ['Nov 13','07:48','WEX ··2208','T-1108','Ana Ruiz','Truck stop #77','Gainesville','TX',118.0,3.82,0,'Matched · FF-24817','ok'],
    ['Nov 13','06:55','WEX ··3391','T-1155','Priya Shah','Fuel plaza #9','Garland','TX',101.3,3.85,0,'Matched · FF-24846','ok'],
    ['Nov 12','22:41','WEX ··1190','T-1149','Devon Price','Truck stop #52','Dallas','TX',212.0,3.84,0,'Over tank capacity','bad'],
    ['Nov 12','18:20','WEX ··2290','T-1133','Luis Ortega','Travel center #301','Irving','TX',96.4,3.86,0,'Matched · FF-24828','ok'],
    ['Nov 12','15:05','WEX ··1142','T-1142','Marcus Bell','Fuel plaza #14','Houston','TX',124.8,3.71,0,'Matched · FF-24801','ok'],
    ['Nov 12','11:37','WEX ··2208','T-1108','Ana Ruiz','Truck stop #77','Gainesville','TX',0,0,38.20,'Non-fuel items','warn'],
    ['Nov 12','08:02','Cash · receipt','T-1102','Sam Whitfield','Travel center #432','Waco','TX',88.2,3.85,339.53,'Receipt · needs review','info'],
    ['Nov 11','19:44','WEX ··1117','T-1117','Ben Okafor','Travel center #260','Memphis','TN',131.5,3.69,0,'Matched · FF-24790','ok'],
    ['Nov 11','13:10','WEX ··1160','T-1160','Kara Nguyen','Fuel plaza #31','Sherman','TX',74.0,3.87,0,'Off route · 38 mi','warn'],
  ];
  const t = {cols:'74px minmax(0,0.9fr) minmax(0,1.25fr) 48px 80px 84px 164px', head:[H('Date'),H('Truck · driver'),H('Station · card'),H('State'),H('Gallons',1),H('Amount',1),H('Check')],
    rows:P.map(([d, tm, card, unit, drv, st, city, stt, g, pr, amt, res, k]) => { const rcpt = k === 'info';
      return {open: rcpt ? () => c.receipt() : noop, cls: rcpt ? 'sel' : '', cells:[T.tx(d, tm, 'num', 'num'), T.tx(unit, drv, 'mono fs12 w5'), T.tx(st, city + ' · ' + card), T.tags([{v:stt, k:'mu'}]),
        g ? T.m(g.toFixed(1), '$' + pr.toFixed(2) + '/gal') : {...T.tx('Snacks','','mu'), al:'rt'}, T.m(fm2(amt || g * pr)), k === 'ok' ? T.rk(res, 'ok') : T.rk(res, k, rcpt ? I.file : I.alert)]}; })};
  const M = IFTA_TRUCKS;
  const cell = v => v ? T.n(n0(v)) : {...T.tx('—','','mu'), al:'rt'};
  const mi = {cols:'minmax(0,1.1fr) 52px 50px 46px 46px 46px 56px 38px minmax(0,1.05fr)',
    head:[H('Truck'),H('TX',1),H('OK',1),H('LA',1),H('AR',1),H('TN',1),H('Total',1),H('MPG',1),H('Source')],
    rows:M.map(([u, d, s, gal, src, k, ic]) => { const tot = s.reduce((a, x) => a + x, 0);
      return {open:noop, cells:[T.tx(u, d, 'mono fs12 w5', d === 'No driver' ? 'mu' : '')].concat(s.map(cell)).concat([T.n(n0(tot)), T.n((tot / gal).toFixed(1)), T.rk(src, k, ic)])}; })
      .concat([{open:noop, cls:'tot', cells:[T.tx('Fleet · 41 trucks','Q4 so far','w6')].concat(IFTA.map(x => T.n(n0(x[2])))).concat([T.n(n0(IC.mi)), T.n(IC.mpg.toFixed(2)), T.tx(n0(IC.gal) + ' gal','bought','t3')])}])};
  // GPS allocation map: FF-24817, Fort Worth → Oklahoma City, split at the Red River
  const VB = [372, 168, 330, 252];
  const pt = (lat, lon) => GEO.P(lat, lon);
  const pc = (lat, lon) => { const [x, y] = pt(lat, lon); return {x:((x - VB[0]) / VB[2] * 100).toFixed(2) + '%', y:((y - VB[1]) / VB[3] * 100).toFixed(2) + '%'}; };
  const map = {vb:VB.join(' '),
    border:GEO.path([[34.38,-99.6],[34.2,-99.2],[33.9,-98.5],[33.87,-97.9],[33.85,-97.3],[33.73,-96.6],[33.85,-96.0],[33.85,-95.6],[33.6,-95.0]]),
    roads:[[[32.75,-97.33],[33.21,-97.13],[34.17,-97.13],[34.74,-97.22],[35.01,-97.36],[35.47,-97.52],[36.4,-97.3]],[[32.78,-96.80],[33.05,-96.99],[33.21,-97.13]],[[32.78,-96.80],[33.64,-96.61],[33.99,-96.37],[34.93,-95.77]],[[32.75,-97.33],[33.91,-98.49],[34.6,-98.4],[35.47,-97.52]],[[32.45,-99.73],[32.76,-97.80],[32.75,-97.33],[32.78,-96.80],[32.5,-95.4]]].map(s => GEO.path(s)).join(' '),
    tx:GEO.path([[32.75,-97.33],[33.21,-97.13],[33.63,-97.13],[33.82,-97.13]]),
    okp:GEO.path([[33.82,-97.13],[34.17,-97.13],[34.35,-97.17]]),
    plan:GEO.path([[34.35,-97.17],[34.74,-97.22],[35.01,-97.36],[35.47,-97.52]]),
    xing:pc(33.82,-97.13), truck:pc(34.35,-97.17),
    labels:[{t:'Texas', ...pc(33.32,-98.45)}, {t:'Oklahoma', ...pc(34.62,-98.62)}].map(o => ({t:o.t, x:o.x, y:o.y})),
    cities:[['Fort Worth',32.75,-97.33,-62,-16],['Dallas',32.78,-96.80,8,-4],['Ardmore',34.17,-97.13,10,-2],['Oklahoma City',35.47,-97.52,10,-6]].map(([n, lat, lon, dx, dy]) => { const [x, y] = pt(lat, lon); return {n, x:((x + dx - VB[0]) / VB[2] * 100).toFixed(2) + '%', y:((y + dy - VB[1]) / VB[3] * 100).toFixed(2) + '%'}; }),
    aria:'Map of load FF-24817 from Fort Worth toward Oklahoma City: 98.4 miles in Texas, then 29.6 miles in Oklahoma so far after crossing the Red River'};
  const rt = {cols:'minmax(0,1fr) 84px 88px 80px 84px 64px 64px 100px',
    head:[H('State'),H('Total miles',1),H('Taxable miles',1),H('Taxable gal',1),H('Tax-paid gal',1),H('Net gal',1),H('Rate',1),H('Tax · (credit)',1)],
    rows:IC.rows.map(r => ({open:noop, cells:[T.tx(r.n, r.ab, 'w5'), T.n(n0(r.m)), T.n(n0(r.m)), T.n(n0(r.tg)), T.n(n0(r.paid)), T.n((r.net < 0 ? '−' : '') + n0(Math.abs(r.net))), T.n('$' + r.rate.toFixed(4)), T.m(money(r.tax), '', r.tax < 0 ? 'sk-ok' : '')]}))
      .concat([{open:noop, cls:'tot', cells:[T.tx('Total','5 states','w6'), T.n(n0(IC.mi)), T.n(n0(IC.mi)), T.n(n0(IC.rows.reduce((a, r) => a + r.tg, 0))), T.n(n0(IC.gal)), T.n('—'), T.tx('',''), T.m(money(IC.tax) + ' due', '', 'w6')]}])};
  return {
    sub:'Fuel purchases, IFTA miles by state and the quarterly return · base jurisdiction Texas',
    kpis:[
      {label:'IFTA miles · Q4', value:n0(IC.mi), suffix:' mi', sub:'5 states · 41 trucks · from GPS', k:'brand', sk:'mu'},
      {label:'Fuel bought · Q4', value:n0(IC.gal), suffix:' gal', sub:'$134,050 · cards and receipts', k:'mu', sk:'mu'},
      {label:'Fleet MPG', value:IC.mpg.toFixed(2), suffix:'', sub:'Calculated · miles ÷ gallons', k:'info', sk:'mu'},
      {label:'Estimated net tax · Q4', value:fm2(IC.tax), suffix:'', sub:'Due in 4 states · Texas credit', k:'warn', sk:'mu'},
      {label:'Return status', value:'Collecting', suffix:'', sub:'Due Jan 31, 2027 · 79 days', k:'info', sk:'mu'}],
    tabs:TABS.map(([l, n, dot], i) => ({l, n, dot, on: i === ftab ? 'on' : '', cur: i === ftab ? 'page' : undefined, go:() => c.setFtab(i)})),
    isP: ftab === 0, isM: ftab === 1, isR: ftab === 2, isT: ftab === 3,
    count:'96 purchases Nov 1–13 · 3 flagged', foot:'Showing 10 of 96 · newest first', t,
    rcpts:[
      {t:'Travel center #432 · Waco, TX', d:'Cash · Sam Whitfield · Nov 12 08:02 · $339.53', st:'Review', k:'info', go:() => c.receipt()},
      {t:'Truck stop #19 · Ardmore, OK', d:'Paper copy · Ana Ruiz · matched WEX ··2208', st:'Matched', k:'ok', go:noop},
      {t:'Fuel plaza #9 · Garland, TX', d:'Photo · Priya Shah · same as a card purchase', st:'Merged', k:'mu', go:noop}],
    prov:[
      {n:'WEX Fleet', d:'38 cards · every 15 min', ini:'WX', k:'brand', on:1},
      {n:'Samsara', d:'GPS miles, fuel level, odometer', ini:'SA', k:'teal', on:1},
      {n:'Comdata', d:'Fuel cards', ini:'CD', k:'mu', on:0},
      {n:'EFS', d:'Fuel cards and money codes', ini:'EF', k:'mu', on:0},
      {n:'AtoB', d:'Fuel cards with network discounts', ini:'AB', k:'mu', on:0},
      {n:'Mudflap', d:'Diesel discounts at truck stops', ini:'MF', k:'mu', on:0}].map(x => ({...x, off: !x.on})),
    mi, map,
    imps:[
      {ext:'CSV', t:'mileage_T1138_oct.csv', d:'14 trips · 3,994 mi · Mei Chen · Nov 2', st:'Imported', k:'ok'},
      {ext:'CSV', t:'mileage_T1138_nov.csv', d:'31 rows · 1 needs a fix', st:'Check', k:'warn'},
      {ext:'✎', t:'Manual · T-1163', d:'2 trips · 1,210 mi · Owen Brooks · Nov 9', st:'Manual', k:'info'}],
    rt, rnote:'Fleet MPG ' + IC.mpg.toFixed(2) + ' = ' + n0(IC.mi) + ' mi ÷ ' + n0(IC.gal) + ' gal. Taxable gallons = taxable miles ÷ MPG; net = taxable − tax-paid gallons; a negative net is a credit, which offsets what’s due in other states on the same return.',
    steps:[['1','Collect miles and fuel','GPS, fuel cards, receipts and imports','Now','cur'],['2','Review','Mei Chen clears gaps, imports and flagged purchases','Jan 2–10',''],['3','Approve','Dana Kim approves the numbers','By Jan 20',''],['4','File','With Texas, the base jurisdiction','By Jan 31',''],['5','Pay or carry the credit','Net due paid with the filing','With filing','']]
      .map(([n, t2, d, w, cls]) => ({n, t:t2, d, w, cls})),
    past:[{q:'Q3 2026', d:'Filed Oct 24', amt:'$412.18', st:'Paid'}, {q:'Q2 2026', d:'Filed Jul 22', amt:'($86.40)', st:'Credit'}, {q:'Q1 2026', d:'Filed Apr 25', amt:'$233.10', st:'Paid'}],
    hist:[{who:'Mei Chen', what:'prepared the return from 2,914 trips', when:'Oct 20', k:'info'}, {who:'Dana Kim', what:'asked for a recheck: T-1138 had imported miles only', when:'Oct 21', k:'warn'},
      {who:'Mei Chen', what:'imported mileage_T1138_sep.csv · 14 trips', when:'Oct 21', k:'info'}, {who:'Dana Kim', what:'approved the return', when:'Oct 23', k:'ok'},
      {who:'FlyFleet', what:'filed with Texas · confirmation TX-2026Q3-48213', when:'Oct 24', k:'brand'}, {who:'Mei Chen', what:'recorded the payment, $412.18', when:'Oct 24', k:'ok'}],
    rates:{cols:'minmax(0,1.2fr) 112px 96px 128px 128px minmax(0,1fr)', head:[H('Jurisdiction'),H('Diesel rate',1),H('Surcharge',1),H('Change vs Q3'),H('Miles this quarter',1),H('Used on')],
      rows:[['Texas','TX',0.20,138888],['Oklahoma','OK',0.19,39352],['Louisiana','LA',0.20,23148],['Arkansas','AR',0.285,18518],['Tennessee','TN',0.27,11574],['New Mexico','NM',0.21,0],['Mississippi','MS',0.24,0],['Missouri','MO',0.295,0]]
        .map(([n, ab, r, m]) => ({open:noop, cells:[T.tx(n, ab, 'w5'), T.m('$' + r.toFixed(4)), {...T.tx('—','','mu'), al:'rt'}, T.tx('No change','','t3'), m ? T.n(n0(m)) : {...T.tx('—','','mu'), al:'rt'}, m ? T.tags([{v:'Q4 estimate', k:'info'}]) : T.tx('Not driven this quarter','','mu')]}))},
    scan:() => c.add('fuel'), connect:() => c.go('settings'), importMi:() => c.imp('mileage'), addTrip:() => c.add('mileage'), reports:() => c.set({screen:'reports', rpt:'fuel', drawer:null, overlay:'none', modal:'none'})};
}

// ---------------------------------------------------------------- dropdown fields: searchable states, makes and types with Other → specify
const DD_OPTS = {};
function ddOpts(name) {
  if (!DD_OPTS[name]) DD_OPTS[name] = name === 'states' ? STATES.map(([n, a]) => ({v:n, l:n, ab:a}))
    : (name === 'truckMakes' ? TRUCK_MAKES : (name === 'trailerMakes' ? TRAILER_MAKES : TRAILER_TYPES)).map(v => ({v, l:v, ab:''}));
  return DD_OPTS[name];
}
const DD_PH = {states:'Choose a state', truckMakes:'Choose a make', trailerMakes:'Choose a make', trailerTypes:'Choose a type'};
const DD_HEAD = {states:'50 states and DC', truckMakes:'Most common in North America', trailerMakes:'Most common in North America', trailerTypes:'Trailer types'};
function ddField(f, id, X) {
  const {c, fv, ddOpen, ddq} = X;
  const v = fv[id] !== undefined ? fv[id] : f.v;
  const isOther = v === 'Other', open = ddOpen === id;
  const q = open ? String(ddq || '').trim().toLowerCase() : '';
  const all = ddOpts(f.dd);
  const hit = o => !q || o.l.toLowerCase().indexOf(q) === 0 || o.l.toLowerCase().indexOf(' ' + q) > 0 || o.ab.toLowerCase() === q;
  const opts = all.filter(hit).map(o => ({l:o.l, ab:o.ab, on: o.v === v ? 'on' : '', sel: o.v === v ? 'true' : 'false', go:() => c.ddPick(id, o.v)}));
  const cur = all.find(o => o.v === v);
  const other = f.dd !== 'states';
  const shown = isOther ? 'Other' : (v || DD_PH[f.dd]);
  return {isDd:true, isInput:false, isSeg:false, oid:id.replace(/\./g, '-') + '-other', shown, aria:f.l + ': ' + shown, ab: cur ? cur.ab : '', vcls: v ? '' : 'mu',
    open, exp: open ? 'true' : 'false', toggle:() => c.ddToggle(open ? null : id), close:() => c.ddToggle(null),
    search: f.dd === 'states', qph:'Search states', q: open ? String(ddq || '') : '', setQ: e => c.ddQ(e && e.target ? e.target.value : ''),
    head: q ? opts.length + (opts.length === 1 ? ' match' : ' matches') : DD_HEAD[f.dd], dopts:opts, none: !opts.length,
    hasOther: other, otherOn: isOther ? 'on' : '', otherSel: isOther ? 'true' : 'false', pickOther:() => c.ddPick(id, 'Other'),
    otherT: f.dd === 'trailerTypes' ? 'Other type' : (f.dd === 'owners' ? 'A new owner' : 'Other make'), otherD: f.dd === 'owners' ? 'Finish their owner record after you save' : 'Type it in yourself',
    showOther: other && isOther, otherL: f.otherL || (f.dd === 'trailerTypes' ? 'Specify type' : 'Specify make'), otherPh: f.otherPh || 'Type it in',
    ov: fv[id + '.o'] || '', setOther: e => c.setField(id + '.o', e && e.target ? e.target.value : '')};
}

// ---------------------------------------------------------------- list helpers: sortable headers, row selection, bulk actions
const SORT_UP = 'M12 19V5M6 11l6-6 6 6', SORT_DN = 'M12 5v14M6 13l6 6 6-6';
function sortable(L, X, keys, def) {
  const {c, lsort} = X;
  const cur = lsort && keys.includes(lsort.k) ? lsort : def;
  L.head = L.head.map((h, i) => { const k = keys[i]; if (!k) return h; const on = !!cur && cur.k === k;
    return {...h, srt:true, son: on ? 'on' : '', sic: on && cur.dir < 0 ? SORT_DN : SORT_UP,
      aria:'Sort by ' + h.l + (on ? (cur.dir > 0 ? ', sorted ascending' : ', sorted descending') : ''), go:() => c.lsort({k, dir: on ? -cur.dir : 1})}; });
  if (cur) L.rows.sort((a, b) => { const x = a.sk[cur.k], y = b.sk[cur.k]; return (x < y ? -1 : (x > y ? 1 : 0)) * cur.dir; });
  return L;
}
function selectable(L, X, acts) {
  const {c, lsel} = X;
  const keys = L.rows.map(r => r.key);
  const n = keys.filter(k => lsel.includes(k)).length;
  L.cols = '16px ' + L.cols;
  L.rows.forEach(r => { const on = lsel.includes(r.key);
    if (on) r.cls = (r.cls ? r.cls + ' ' : '') + 'sel';
    r.cells.unshift(T.chk(on, e => { if (e && e.stopPropagation) e.stopPropagation(); c.lsel(on ? lsel.filter(x => x !== r.key) : lsel.concat([r.key])); })); });
  return Object.assign(L, {selectable:true, allOn: n ? 'on' : '', allAll: n > 0 && n === keys.length, allSome: n > 0 && n < keys.length,
    allAria: n === keys.length ? 'Clear selection' : 'Select all on this page', toggleAll:() => c.lsel(n === keys.length ? [] : keys),
    bulk: n > 0, selN: String(n), bulkActs: acts, clearSel:() => c.lsel([])});
}
const tone = k => k === 'ok' ? 'sk-ok' : (k === 'warn' ? 'sk-warn' : (k === 'bad' ? 'sk-bad' : 'sk-mu'));

// fleet details shown in the tables: VIN tail, model, plate expiry, where the unit is and how fresh that is
const TRUCK_X = {
  'T-1102':['LG8821','Cascadia 126','03/27','','Waco, TX','Live · 1 min','ok'],
  'T-1108':['NB4410','Cascadia 126','01/27','','Ardmore, OK','Live · 61 mph','ok'],
  'T-1117':['PN0937','VNL 760','06/27','','Dallas yard','Live · parked 6 h','ok'],
  'T-1121':['NJ6115','T680','09/27','','Temple, TX','Live · 58 mph','ok'],
  'T-1129':['MJ1027','579','02/27','','Garland, TX','Live · parked 3 h','ok'],
  'T-1133':['PS0092','Cascadia 126','07/27','','Irving, TX','Live · at the dock','ok'],
  'T-1138':['LK3321','LT625','12/26','warn','Houston shop','No signal · 3 d','bad'],
  'T-1142':['PJ7781','T680','08/27','','Spring, TX','Live · 64 mph','ok'],
  'T-1149':['MN5502','VNL 760','05/27','','Dallas, TX','Stale · 47 min','warn'],
  'T-1155':['NS2219','Cascadia 126','04/27','','McAlester, OK','Live · 55 mph','ok'],
  'T-1160':['PJ9105','579','10/27','','Dallas yard','Live · parked 9 h','ok'],
  'T-1163':['LM7718','Anthem 64T','12/26','warn','Dallas shop','Live · in WO-1175','ok'],
};
const TRAILERS = [
  ['TR-5259','Dry van','53’','2021','Utility','4000D-X','1XJ 2259','08/27','Loaded','assigned','T-1102','FF-24866','Inspection in 4 mo','mu','Live','Waco, TX','ok'],
  ['TR-5264','Dry van','53’','2022','Wabash','DuraPlate','1XJ 5264','11/27','Empty','ok','T-1117','','Inspection in 7 mo','mu','Live','Dallas yard','ok'],
  ['TR-5276','Dry van','53’','2020','Great Dane','Champion','1XH 5276','04/27','At pickup','atpickup','T-1133','FF-24828','Brake check in 9 d','warn','Live','Irving, TX','ok'],
  ['TR-5288','Dry van','53’','2023','Utility','4000D-X','1XK 5288','02/27','Loaded','assigned','T-1142','FF-24801','Inspection in 10 mo','mu','Live','Spring, TX','ok'],
  ['TR-5290','Dry van','53’','2021','Wabash','DuraPlate','1XH 5290','06/27','On hold','hold','T-1129','FF-24833','Inspection in 2 mo','mu','Live','Garland, TX','ok'],
  ['TR-5301','Reefer','53’','2022','Utility','3000R','1XJ 5301','09/27','Loaded','assigned','T-1121','FF-24839','Reefer alarm 22','bad','Live · 34°F','Temple, TX','ok'],
  ['TR-5302','Reefer','53’','2021','Great Dane','Everest','1XH 5302','01/27','Empty','ok','','','Reefer PM in 120 h','warn','Live · unit off','Houston yard','ok'],
  ['TR-5307','Dry van','53’','2019','Wabash','DuraPlate','1XG 5307','12/26','In the shop','warn','','','Registration in 23 d','warn','No signal · 2 d','Dallas shop','bad'],
  ['TR-5312','Dry van','53’','2022','Utility','4000D-X','1XJ 5312','05/27','Loaded','assigned','T-1108','FF-24817','Inspection in 6 mo','mu','Live','Ardmore, OK','ok'],
  ['TR-5317','Dry van','53’','2023','Hyundai Translead','HT CompositeLite','1XK 5317','07/27','Empty','ok','T-1149','','Inspection in 11 mo','mu','Stale · 47 min','Dallas, TX','warn'],
  ['TR-5319','Dry van','53’','2023','Utility','4000D-X','1XK 5319','10/27','Loaded','assigned','T-1155','FF-24846','Inspection in 9 mo','mu','Live','McAlester, OK','ok'],
  ['TR-5340','Flatbed','48’','2020','Fontaine','Infinity','1XG 5340','03/27','Empty','ok','','','Tarp & strap check','warn','No tracker','Dallas yard','mu'],
  ['TR-5341','Step deck','48’','2022','Fontaine','Velocity','1XK 5341','08/27','Empty','ok','','','Inspection in 5 mo','mu','Live','Dallas yard','ok'],
  ['TR-5343','Tanker','42’','2021','Polar','7,000 gal aluminum','1XH 5343','06/27','Empty','ok','','','Tank inspection in 21 d','warn','Live','Dallas yard','ok'],
];
const DRV_X = {
  'Marcus Bell':['mbell','T'], 'Ana Ruiz':['aruiz',''], 'Jamal Carter':['jcarter','H'], 'Priya Shah':['pshah',''], 'Luis Ortega':['lortega','N, T'], 'Ben Okafor':['bokafor',''],
  'Tom Reyes':['treyes','X'], 'Kara Nguyen':['knguyen',''], 'Sam Whitfield':['swhitfield',''], 'Devon Price':['dprice','N'], 'Leah Morgan':['lmorgan','H'], 'Victor Hale':['vhale',''],
};
const CUST_PH = {'Walmart Transportation':'(479) 555-0142','Home Depot Supply':'(770) 555-0188','Sysco North Texas':'(817) 555-0131','PepsiCo Logistics':'(972) 555-0170','Georgia-Pacific':'(404) 555-0119',
  'Kimberly-Clark':'(972) 555-0156','Owens Corning':'(419) 555-0124','ABC Supply':'(608) 555-0193','Builders FirstSource':'(214) 555-0107'};

const buildList2 = buildList;
buildList = function (screen, X) {
  const {fin, c, team} = X;
  const L = buildList2(screen, X);
  if (!L) return L;
  const drvOf = u => DRIVERS.find(d => 'T-' + d.t === u);
  const yr = y => Number(y);

  if (screen === 'trucks') {
    const rows = TRUCKS.filter(x => inTeam(team, x[0])).map(([u, mm, pl, st, k, , odo, asg, nx, nk]) => {
      const [vin, model, exp, ek, loc, live, lk] = TRUCK_X[u];
      const [make, year] = mm.split(' · '), mk = make.split(' ')[0] === 'Western' ? 'Western Star' : make.split(' ')[0];
      const [ps, plate] = pl.split(' · '), d = drvOf(u);
      return {key:u, open:noop, sk:{unit:u, year:yr(year), make:mk, odo:Number(odo.replace(/,/g, '')), drv: d ? d.n : '~', own:ownSort(u)},
        cells:[T.tx(u, 'VIN …' + vin, 'mono w5', 'mono'), T.tx(year,'','num t2'), T.tx(mk, model), T.tx(plate, ps + ' · exp ' + exp, 'mono fs12', ek ? 'sk-warn' : ''), T.b(st, k),
          d ? T.p(d.n, d.i, asg === '—' ? (d.st === 'Available' ? 'No load' : d.st) : asg, d.sk === 'ok' ? 'ok' : (d.sk === 'mu' ? 'mu' : 'brand')) : T.tx('No driver','','mu'),
          T.tx(loc, live, '', tone(lk)), T.tx(nx.replace('Annual inspection','DOT annual'), odo + ' mi on the odometer', nk === 'mu' ? '' : tone(nk === 'bad' ? 'bad' : 'warn'), ''), ownCell(u), T.more()]};
    });
    Object.assign(L, {cols:'84px 40px minmax(0,0.85fr) 96px 116px minmax(0,1.05fr) minmax(0,0.9fr) minmax(0,1.2fr) minmax(0,0.95fr) 28px',
      head:[H('Unit'),H('Year'),H('Make · model'),H('Plate'),H('Status'),H('Driver · load'),H('Location'),H('Next service'),H('Owner'),H('')], rows,
      sub:(team ? team.name + ' · 14 trucks' : '41 trucks · 38 dispatchable') + ' · trucks out of service or in the shop can’t be dispatched', ph:'Unit, VIN, plate or driver',
      kpis: team ? [
        {label:'On loads now', value:'9', suffix:' of 14', sub:'64% of the team’s trucks', k:'brand', sk:'mu'},
        {label:'Available', value:'4', suffix:'', sub:'3 in Dallas · 1 empty in Ardmore', k:'ok', sk:'mu'},
        {label:'In the shop', value:'1', suffix:'', sub:'Back in service tomorrow', k:'warn', sk:'mu'},
        {label:'Service due · 30 days', value:'3', suffix:'', sub:'1 DOT annual inspection', k:'info', sk:'mu'}] : [
        {label:'On loads now', value:'31', suffix:' of 41', sub:'76% utilization · 72% last week', k:'brand', sk:'ok'},
        {label:'Available', value:'6', suffix:'', sub:'4 in Dallas · 2 heading home', k:'ok', sk:'mu'},
        {label:'In the shop', value:'4', suffix:'', sub:'3 in maintenance · 1 out of service', k:'warn', sk:'mu'},
        {label:'Service due · 30 days', value:'9', suffix:'', sub:'2 DOT annual · 7 preventive', k:'info', sk:'mu'},
        {label:'Company-owned', value:'33', suffix:' of 41', sub:'8 owned by 4 outside owners', k:'mu', sk:'mu'}], kpiN: team ? 4 : 5,
      adds:['Status','Make','Year','Location'], foot: team ? 'Showing 6 of 14' : 'Showing 1–12 of 41'});
    sortable(L, X, ['unit','year','make',null,null,'drv',null,null,'own'], {k:'unit', dir:1});
    return selectable(L, X, ['Assign to a team','Schedule service','Change status','Export']);
  }

  if (screen === 'trailers') {
    const rows = TRAILERS.map(([u, ty, len, year, make, model, plate, exp, st, k, trk, ld, nx, nk, tel, loc, tk]) => ({key:u, open:noop, cls: ty === 'Step deck' || ty === 'Tanker' ? '' : '',
      sk:{unit:u, type:ty, year:yr(year), make, own:ownSort(u)},
      cells:[T.tx(u,'','mono w5'), T.tx(ty, len + (ty === 'Reefer' ? ' · refrigerated' : '')), T.tx(year,'','num t2'), T.tx(make, model),
        T.tx(plate, 'TX · exp ' + exp, 'mono fs12', exp === '12/26' ? 'sk-warn' : ''), T.b(st, k),
        ld ? T.id(ld, trk, () => c.open(ld)) : T.tx('—', trk || 'Not hooked', 'mu', ''),
        T.tx(loc, tel, '', tone(tk)), T.rk(nx, nk, I.wrench), ownCell(u), T.more()]}));
    Object.assign(L, {cols:'72px 92px 40px minmax(0,0.9fr) 96px 104px 92px minmax(0,0.85fr) minmax(0,1.15fr) minmax(0,0.95fr) 28px',
      head:[H('Unit'),H('Type'),H('Year'),H('Make · model'),H('Plate'),H('Status'),H('Load · truck'),H('Location'),H('Next service'),H('Owner'),H('')], rows,
      sub:'64 trailers · 46 dry vans, 14 reefers, 2 flatbeds, 1 step deck, 1 tanker · trailers in the shop can’t be dispatched', ph:'Unit, VIN, plate or truck',
      tabs:[['All','64'],['Loaded','44'],['Empty','18'],['In the shop','2']].map(([l, n], i) => ({l, n, on: i === 0 ? 'on' : ''})),
      kpis:[
        {label:'Loaded now', value:'44', suffix:' of 64', sub:'69% utilization · 18 empty', k:'brand', sk:'mu'},
        {label:'Ready in a yard', value:'16', suffix:'', sub:'Dallas 11 · Houston 3 · Ardmore 2', k:'ok', sk:'mu'},
        {label:'Reefers running', value:'12', suffix:' of 14', sub:'1 alarm · 1 unit off', k:'info', sk:'bad'},
        {label:'Service due · 60 days', value:'7', suffix:'', sub:'1 tank inspection · 1 registration', k:'warn', sk:'mu'}], kpiN:4,
      adds:['Type','Status','Make','Year'], foot:'Showing 1–14 of 64'});
    sortable(L, X, ['unit','type','year','make',null,null,null,null,null,'own'], {k:'unit', dir:1});
    return selectable(L, X, ['Schedule service','Change status','Move to a yard','Export']);
  }

  if (screen === 'drivers') {
    const rows = DRIVERS.filter(d => inTeam(team, d.t)).map(d => {
      const q = qualOf(d), l = loadOf(d.n), pres = d.sk === 'ok' ? 'ok' : (d.sk === 'mu' ? 'mu' : 'brand');
      const [em, end] = DRV_X[d.n] || ['', ''];
      const unit = d.t === '—' ? '' : 'T-' + d.t + (d.tr && d.tr !== '—' ? ' · TR-' + d.tr : '');
      return {key:d.n, cls: d.st === 'Inactive' ? 'dim' : '', open: () => c.driver(d.n), sk:{name:d.n.split(' ').reverse().join(' '), st:d.st, q:-SEV[q.k], since:d.emp},
        cells:[T.p(d.n, d.i, d.emp + (d.n === 'Tom Reyes' ? ' · owner-operator' : ' · since ' + d.hired.split(' ').pop()), pres), T.tx(d.ph,'','mono fs12 t2'), T.tx(em ? em + '@lonestarfreight.com' : '—','','fs12 t2'),
          T.tx('Class A · ' + d.cdl.split(' · ')[1], end ? 'Endorsements ' + end : 'No endorsements', 't2', end ? '' : 'mu'), T.b(d.st, d.sk),
          T.dots(q.v, d.q.map(x => x[0]), q.k), l ? T.id(l.id, unit, () => c.open(l.id)) : T.tx('—', unit || 'No truck', 'mu', ''), T.ch(chansOf(d)), T.more()]};
    });
    Object.assign(L, {cols:'minmax(0,1.05fr) 104px minmax(0,1.2fr) 116px 108px minmax(0,1.25fr) 112px 52px 28px',
      head:[H('Driver'),H('Mobile'),H('Email'),H('CDL'),H('Status'),H('Qualification'),H('Load · truck'),H('Apps'),H('')], rows, ph:'Name, phone, email or truck',
      kpis: team ? [
        {label:'Dispatchable', value:'13', suffix:' of 14', sub:'1 needs a road test certificate', k:'ok', sk:'mu'},
        {label:'On a load', value:'9', suffix:'', sub:'2 available · 3 starting later', k:'brand', sk:'mu'},
        {label:'Expiring · 30 days', value:'3', suffix:'', sub:'2 medical cards · 1 MVR review', k:'warn', sk:'mu'},
        {label:'Driver app', value:'14', suffix:' of 14', sub:'10 also on Telegram', k:'info', sk:'mu'}] : [
        {label:'Dispatchable', value:'38', suffix:' of 42', sub:'3 blocked by documents · 1 inactive', k:'ok', sk:'mu'},
        {label:'On a load', value:'29', suffix:'', sub:'9 available · 4 off duty', k:'brand', sk:'mu'},
        {label:'Expiring · 30 days', value:'5', suffix:'', sub:'2 medical cards · 2 MVRs · 1 CDL', k:'warn', sk:'warn'},
        {label:'Driver app', value:'36', suffix:' of 42', sub:'31 also on Telegram · 6 SMS only', k:'info', sk:'mu'}], kpiN:4,
      adds:['Status','Qualification','Endorsement','Channel']});
    sortable(L, X, ['name',null,null,null,'st','q'], {k:'name', dir:1});
    return selectable(L, X, ['Message','Request documents','Invite to app','Export']);
  }

  if (screen === 'customers') {
    const rows = CUSTOMERS.map(([n, code, st, k, ct, terms, loads, bal, ot]) => ({key:n, cls: st === 'Archived' ? 'dim' : '', open:noop, sk:{n, loads:Number(loads), bal, ot:parseInt(ot, 10) || 0},
      cells:[T.tx(n, code, 'w5', 'mono'), T.b(st, k), T.tx(ct, ct === '—' ? '' : 'Operations'), T.tx(ct === '—' ? '—' : CUST_PH[n], '', ct === '—' ? 'mu' : 'mono fs12 t2'), T.tx(terms,'','t3'), T.n(loads)]
        .concat(fin ? [T.m(fm(bal), '', bal ? '' : 'mu')] : []).concat([T.n(ot), T.more()])}));
    Object.assign(L, {cols:'minmax(0,1.4fr) 124px minmax(0,1fr) 120px 72px 88px' + (fin ? ' 112px' : '') + ' 72px 28px',
      head:[H('Customer'),H('Status'),H('Primary contact'),H('Phone'),H('Terms'),H('Loads · 30 d',1)].concat(fin ? [H('Open balance',1)] : []).concat([H('On time',1),H('')]), rows,
      kpis:[
        {label:'Active customers', value:'7', suffix:'', sub:'1 in credit review · 1 archived', k:'ok', sk:'mu'},
        {label:'Loads · 30 days', value:'236', suffix:'', sub:'Walmart and Home Depot are 44%', k:'brand', sk:'mu'},
        {label:'On time · 30 days', value:'93', suffix:'%', sub:'Kimberly-Clark lowest at 86%', k:'info', sk:'warn'}].concat(fin ? [
        {label:'Average days to pay', value:'34', suffix:' days', sub:'Most customers are on Net 30', k:'warn', sk:'mu'}] : []), kpiN: fin ? 4 : 3,
      ph:'Name, code, contact or phone'});
    sortable(L, X, ['n',null,null,null,null,'loads'].concat(fin ? ['bal','ot'] : ['ot']), {k:'n', dir:1});
    return L;
  }
  return L;
};

// ---------------------------------------------------------------- reports: line charts for weekly rates, Fuel & IFTA report
function lineChart(pts, lo, hi, fmt, o) {
  const n = pts.length, W = 800, HT = 200;
  const xf = i => (i + 0.5) / n, yf = v => 1 - (v - lo) / (hi - lo);
  return {vb:'0 0 ' + W + ' ' + HT, w:(100 / n).toFixed(3) + '%',
    path:pts.map(([, v], i) => (i ? 'L' : 'M') + (xf(i) * W).toFixed(1) + ',' + (yf(v) * HT).toFixed(1)).join(' '),
    pts:pts.map(([l, v, tip], i) => ({l, v:fmt(v), x:(xf(i) * 100).toFixed(3) + '%', y:(yf(v) * 100).toFixed(2) + '%', lab: i === 0 || i === n - 1, tip:tip || '',
      lp: (i === 0 && n > 1 && pts[1][1] > v) || (i === n - 1 && n > 1 && pts[n - 2][1] > v) ? 'dn' : '',
      aria:'Week of ' + l + ': ' + fmt(v) + (tip ? '. ' + tip : '')})),
    ref: o && o.ref !== undefined ? {y:(yf(o.ref) * 100).toFixed(2) + '%', l:o.refL} : null, ticks:o.ticks, grid:(100 / (o.ticks.length - 1)).toFixed(4) + '%'};
}
const buildReports2 = buildReports;
buildReports = function (X) {
  const {c, fin, rpt, tv} = X;
  const R = buildReports2(X);
  const cur = rpt === 'fuel' && fin ? 'fuel' : 'ontime';
  R.cat = R.cat.map(g => ({...g, items:g.items.map(it => {
    const l = it.l === 'Fuel and IFTA' ? 'Fuel & IFTA' : it.l, key = l === 'On-time delivery' ? 'ontime' : (l === 'Fuel & IFTA' ? 'fuel' : '');
    return {...it, l, on: key === cur ? 'on' : '', cur: key === cur ? 'page' : undefined, go: key && !it.lock ? () => c.set({rpt:key}) : noop}; })}));
  R.isOnTime = cur === 'ontime'; R.isFuel = cur === 'fuel';
  const W = [['Sep 21',89.1],['Sep 28',90.4],['Oct 5',88.7],['Oct 12',91.9],['Oct 19',92.6],['Oct 26',90.8],['Nov 2',93.3],['Nov 9',93.0]];
  R.ot = {...lineChart(W, 80, 100, v => v.toFixed(1) + '%', {ref:95, refL:'Target 95%', ticks:['100%','95%','90%','85%','80%']}), aria:R.aria};
  if (R.isFuel) {
    const IC = iftaCalc();
    const WK = [['Sep 21',3.97,6.61],['Sep 28',3.95,6.64],['Oct 5',3.91,6.66],['Oct 12',3.93,6.68],['Oct 19',3.89,6.71],['Oct 26',3.86,6.73],['Nov 2',3.84,6.72],['Nov 9',3.86,6.69]];
    R.cpm = {...lineChart(WK.map(([l, p, m]) => [l, p / m, 'Diesel $' + p.toFixed(2) + '/gal · ' + m.toFixed(2) + ' MPG']), 0.56, 0.62, v => '$' + v.toFixed(3), {ticks:['$0.62','$0.60','$0.58','$0.56']}),
      aria:'Fuel cost per mile by week, from $0.601 in the week of Sep 21 to $0.577 in the week of Nov 9'};
    R.cpmView = {chart: !tv.cpm, table: !!tv.cpm, c: tv.cpm ? '' : 'on', t: tv.cpm ? 'on' : '', cp: tv.cpm ? 'false' : 'true', tp: tv.cpm ? 'true' : 'false', toChart:() => c.tview('cpm', false), toTable:() => c.tview('cpm', true),
      rows:WK.map(([l, p, m]) => ({l, p:'$' + p.toFixed(2), m:m.toFixed(2), v:'$' + (p / m).toFixed(3)}))};
    // dot plot against the fleet average: position encodes MPG, so the axis can start at 5.5
    const LO = 5.5, HI = 7.5, AVG = IC.mpg, px = v => ((v - LO) / (HI - LO) * 100).toFixed(2) + '%';
    R.mpg = IFTA_TRUCKS.map(([u, d, st, gal]) => { const mi = st.reduce((a, x) => a + x, 0); return {u, d, mi, gal, mpg: mi / gal}; }).sort((a, b) => b.mpg - a.mpg)
      .map(x => ({n:x.u + ' · ' + (x.d === 'No driver' ? 'no driver' : x.d.split(' ').slice(-1)[0]), v:x.mpg.toFixed(2), x:px(x.mpg),
        sl:px(Math.min(x.mpg, AVG)), sw:(Math.abs(x.mpg - AVG) / (HI - LO) * 100).toFixed(2) + '%',
        aria:x.u + ': ' + x.mpg.toFixed(2) + ' MPG, ' + x.mi.toLocaleString('en-US') + ' mi on ' + x.gal.toLocaleString('en-US') + ' gal · ' + (x.mpg >= AVG ? '+' : '−') + Math.abs(x.mpg - AVG).toFixed(2) + ' vs fleet'}));
    R.mpgRef = px(AVG);
    R.mpgAx = [5.5, 6, 6.5, 7, 7.5].map(v => ({l:v.toFixed(1), x:px(v)}));
    R.fk = [
      {label:'Fuel spend · Q4 so far', value:'$134,050', suffix:'', sub:n0f(IC.gal) + ' gal · $3.88 a gallon', sk:'mu'},
      {label:'Fuel cost per mile', value:'$0.579', suffix:'', sub:'▼ 1.8¢ vs Q3', sk:'ok'},
      {label:'Fleet MPG', value:IC.mpg.toFixed(2), suffix:'', sub:'▲ 0.06 vs Q3', sk:'ok'},
      {label:'IFTA net due · estimate', value:fm2(IC.tax), suffix:'', sub:'Texas credit offsets most of it', sk:'mu'}];
  }
  return R;
};
const n0f = v => v.toLocaleString('en-US');

// ---------------------------------------------------------------- equipment owners (DB: equipment_owners; UI: Directory → Owners)
// Three separate records: ownership (who owns a unit), employment (who works for the carrier), assignment (who drives a unit today).
I.owner = 'M3 8h18v12H3zM8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18M11 12v3h2v-3';
const OWN_KIND = {carrier:['Company fleet','mu'], op:['Owner-operator','brand'], fleet:['Fleet owner','teal'], investor:['Equipment investor','violet'], employee:['Employee-owner','info']};
const OWNERS = [
  {id:'LSF', n:'Lone Star Freight LLC', short:'Company fleet', ini:'LS', kind:'carrier', person:'', ph:'', since:'2014', status:'Active', sk:'ok', trucks:33, trailers:60,
    units:'33 trucks · 60 trailers', drives:['Company drivers',''], agr:'Owned outright', agrS:'Titles held by Lone Star', portal:'', pk:'mu', stmt:null},
  {id:'CT', n:'Castillo Transport LLC', short:'Castillo Transport', tshort:'Castillo Transport',  ini:'CT', kind:'fleet', person:'Hector Castillo', prole:'Principal', ph:'(956) 555-0142', city:'Laredo, TX', since:'Mar 2024', status:'Active', sk:'ok', tax:'EIN ending 4417',
    trucks:4, trailers:0, units:'T-1168, T-1174, T-1177, T-1180', drives:['4 drivers','Hired by Castillo'], agr:'Lease-on · 72% of line haul', agrS:'Plus 100% of fuel surcharge', portal:'Active · 2 users', pk:'ok', stmt:[12236.34, 'Nov 2–8 · in review']},
  {id:'TR', n:'Reyes Trucking LLC', short:'Reyes Trucking', tshort:'Reyes Trucking',  ini:'RT', kind:'op', person:'Tom Reyes', prole:'Owner, drives T-1129', ph:'(972) 555-0148', city:'Garland, TX', since:'Apr 2018', status:'Active', sk:'ok', tax:'EIN ending 2093',
    trucks:1, trailers:0, units:'T-1129', drives:['Tom Reyes','The owner himself'], agr:'Lease-on · 70% of line haul', agrS:'Settled on Driver statements', portal:'Active · 1 user', pk:'ok', stmt:[2476.00, 'Nov 2–8 · in review']},
  {id:'PC', n:'Pecan Creek Equipment LLC', short:'Pecan Creek Equipment', tshort:'Pecan Creek',  ini:'PC', kind:'investor', person:'Linda Tran', prole:'Managing member', ph:'(512) 555-0183', city:'Austin, TX', since:'Jan 2025', status:'Active', sk:'ok', tax:'EIN ending 6150',
    trucks:2, trailers:4, units:'T-1149, T-1190 · 4 trailers', drives:['Lone Star drivers','Pecan Creek hires none'], agr:'Equipment rental', agrS:'$0.30 a mile · $425 a trailer a week', portal:'Active · 1 user', pk:'ok', stmt:[2587.00, 'Nov 2–8 · approved']},
  {id:'AR', n:'Alex Rivera', short:'Alex Rivera', tshort:'Alex Rivera',  ini:'AR', kind:'employee', person:'Alex Rivera', prole:'Dispatcher at Lone Star', ph:'(214) 555-0166', city:'Dallas, TX', since:'Jun 2025', status:'Active', sk:'ok', tax:'SSN ending 7731',
    trucks:1, trailers:0, units:'T-1186', drives:['Jerome Banks','Hired by Alex'], agr:'Lease-on · 72% of line haul', agrS:'Plus 100% of fuel surcharge', portal:'Active · 1 user', pk:'ok', stmt:[2912.40, 'Nov 2–8 · in review']},
  {id:'MB', n:'Brooks Hauling LLC', short:'Brooks Hauling', tshort:'Brooks Hauling',  ini:'BH', kind:'op', person:'Maya Brooks', prole:'Owner, will drive T-1195', ph:'(469) 555-0121', city:'Mesquite, TX', since:'—', status:'Onboarding', sk:'info', tax:'EIN ending 3302',
    trucks:1, trailers:0, units:'T-1195 · not in service yet', drives:['Maya Brooks','The owner herself'], agr:'Lease-on · draft', agrS:'Sent for e-signature Nov 12', portal:'Invited', pk:'warn', stmt:null},
  {id:'KL', n:'Kowalski Leasing Inc.', short:'Kowalski Leasing', tshort:'Kowalski Leasing',  ini:'KL', kind:'fleet', person:'Pete Kowalski', prole:'President', ph:'(817) 555-0175', city:'Fort Worth, TX', since:'Feb 2022', status:'Ended', sk:'mu', tax:'EIN ending 8841',
    trucks:0, trailers:0, units:'2 trucks returned Sep 30', drives:['—',''], agr:'Lease ended Sep 30, 2026', agrS:'Escrow refund due Nov 14', portal:'Read-only to Dec 31', pk:'mu', stmt:[0, 'Final accounting due Nov 14']},
];
const OWNER_OF = {'T-1129':'TR', 'T-1149':'PC', 'T-1190':'PC', 'T-1168':'CT', 'T-1174':'CT', 'T-1177':'CT', 'T-1180':'CT', 'T-1186':'AR', 'T-1195':'MB',
  'TR-5302':'PC', 'TR-5340':'PC', 'TR-5341':'PC', 'TR-5343':'PC'};
const ownerOf = u => OWNERS.find(o => o.id === (OWNER_OF[u] || 'LSF'));
const ownCell = u => { const o = ownerOf(u); return o.kind === 'carrier' ? T.tx('Company fleet', '', 'mu') : T.tx(o.tshort, OWN_KIND[o.kind][0], 'w5'); };
const ownSort = u => { const o = ownerOf(u); return o.kind === 'carrier' ? 'zzz' : o.short; };

const eqCount = o => o.kind === 'carrier' ? o.trucks + ' trucks' : (o.trucks || o.trailers ? [o.trucks ? o.trucks + (o.trucks === 1 ? ' truck' : ' trucks') : '', o.trailers ? o.trailers + ' trailers' : ''].filter(Boolean).join(' · ') : 'None now');
// owners directory
const buildList3 = buildList;
buildList = function (screen, X) {
  if (screen !== 'owners') return buildList3(screen, X);
  const {fin, c} = X;
  const A = (l, cls, ic, go) => ({l, cls:cls||'', ic:ic||'', go:go||noop});
  const rows = OWNERS.map(o => { const [kl] = OWN_KIND[o.kind], car = o.kind === 'carrier';
    return {key:o.id, cls: o.status === 'Ended' ? 'dim' : '', open: car ? () => c.go('trucks') : () => c.owner(o.id), sk:{n: car ? '' : o.n, eq:-(o.trucks * 2 + o.trailers)},
      cells:[T.p(o.n, o.ini, kl, ''), car ? T.tx('—','','mu') : T.tx(o.person, o.ph, '', 'mono'), T.tx(eqCount(o), car ? o.trailers + ' trailers' : o.units, '', ''),
        T.tx(o.drives[0], o.drives[1], o.drives[0] === '—' ? 'mu' : ''), T.tx(o.agr, o.agrS)]
        .concat(fin ? [o.stmt ? {...T.tx(o.stmt[0] ? fm2(o.stmt[0]) : '—', o.stmt[1], 'mono w5', ''), al:'rt'} : {...T.tx('—','','mu'), al:'rt'}] : [])
        .concat([T.b(car ? 'Carrier' : o.status, car ? 'mu' : o.sk), T.more()])}; });
  const L = {tabs:[['All','7'],['Active','5'],['Onboarding','1'],['Ended','1']].map(([l, n], i) => ({l, n, on: i === 0 ? 'on' : ''})), band:null, callout:null, chips:[], hidden: fin ? '' : 'Pay and statements hidden for your role',
    group:'Directory', title:'Owners', sub:'Who owns each truck and trailer: Lone Star, or an outside owner. Owning equipment is separate from working here and from driving.', ph:'Owner, person, unit or EIN',
    actions:[A('Invite to portal','', I.mobile), A('Add owner','pri', I.plus, () => c.add('owner'))],
    kpis:[
      {label:'Outside owners', value:'6', suffix:'', sub:'4 active · 1 onboarding · 1 ended', k:'brand', sk:'mu'},
      {label:'Trucks owned by others', value:'8', suffix:' of 41', sub:'33 owned by Lone Star', k:'teal', sk:'mu'},
      {label:'Trailers owned by others', value:'4', suffix:' of 64', sub:'All with Pecan Creek Equipment', k:'violet', sk:'mu'}].concat(fin ? [
      {label:'Owner statements · Nov 2–8', value:'$20,211.74', suffix:'', sub:'4 statements · 3 in review', k:'info', sk:'mu'},
      {label:'Escrow held', value:'$15,000', suffix:'', sub:'Kowalski refund due Nov 14', k:'warn', sk:'warn'}] : []), kpiN: fin ? 5 : 3,
    adds:['Type','Agreement','Portal'], foot:'Showing 7 of 7',
    cols:'minmax(0,1.5fr) minmax(0,1fr) minmax(0,0.95fr) minmax(0,1fr) minmax(0,1.45fr)' + (fin ? ' 150px' : '') + ' 108px 28px',
    head:[H('Owner'),H('Contact'),H('Equipment'),H('Who drives'),H('Agreement')].concat(fin ? [H('Last statement',1)] : []).concat([H('Status'),H('')]), rows};
  sortable(L, X, ['n',null,'eq'], {k:'n', dir:1});
  return selectable(L, X, ['Send statements','Invite to portal','Export']);
};



// owner pickers on truck and trailer forms: who owns it is required; who drives it is set in Dispatch
DD_OPTS.owners = OWNERS.filter(o => o.status !== 'Ended').map(o => ({v:o.n, l:o.n, ab: o.kind === 'carrier' ? 'Company' : OWN_KIND[o.kind][0]}));
DD_PH.owners = 'Choose an owner'; DD_HEAD.owners = 'Owners on file';
const OWN_FIELDS = [mf3('Owner','Lone Star Freight LLC',3,{dd:'owners', k:'owner', other:1, otherL:'New owner’s legal name', otherPh:'As on their W-9'}), mf3('Owned since','',3,{ph:'MM/DD/YYYY', mono:1, hint:'Who drives it is set in Dispatch, separately'})];
MANUAL.truck.groups.splice(1, 0, ['Ownership', OWN_FIELDS]);
MANUAL.trailer.groups.splice(1, 0, ['Ownership', OWN_FIELDS]);
REVIEW.truck.fields = splitRv(REVIEW.truck.fields, {'Registered owner':[rf3('Registered owner','Lone Star Freight LLC','95%','ok','Matched',{dd:'owners', key:'owner', note:'Matched to an owner record. Who drives the truck is set in Dispatch, separately.'})]});
REVIEW.trailer.fields = REVIEW.trailer.fields.concat([rf3('Owner','Lone Star Freight LLC','','ok','From the registration',{dd:'owners', key:'owner'})]);
// add an owner: a business or person that owns equipment, never a contact card
Object.assign(ADD, {owner:{title:'Add an owner', plural:'owners', ic:'owner', doc:'', mod:'owners', cta:'Create owner', photoT:'', photoD:'', reads:[], manualD:'', slots:[], tips:[], alt:'',
  done:'Castillo Transport LLC added · ownership records created for 4 trucks'}});
MANUAL.owner = {groups:[
  ['Owner', [mf3('Type','',4,{opts:['Owner-operator','Fleet owner','Equipment investor'], on:'Fleet owner'}), mf3('Also works for Lone Star?','',2,{opts:['No','Yes'], on:'No', hint:'Yes links their employee record; it never changes ownership'})]],
  ['Business', [mf3('Legal name','',3,{ph:'As on the W-9'}), mf3('DBA','',3,{ph:'Optional'}), mf3('EIN or SSN','',2,{mono:1, ph:'••-•••••••', hint:'Encrypted · only the last 4 show'}), mf3('Contact','',2,{ph:'Name of the principal'}), mf3('State','Texas',2,{dd:'states', k:'state'})]],
  ['Agreement', [mf3('Agreement','',6,{opts:['Lease-on · % of line haul','Lease-on · per mile','Equipment rental'], on:'Lease-on · % of line haul'}), mf3('Owner’s share','72%',2,{mono:1}), mf3('Fuel surcharge passed through','100%',2,{mono:1}), mf3('Escrow per truck','$2,500',2,{mono:1, hint:'Interest paid quarterly'})]],
  ['Equipment', [mf3('Trucks they own','',3,{ph:'Search units, or add one', hint:'Each unit gets its own ownership record'}), mf3('Trailers they own','',3,{ph:'Search units, or add one', hint:'Drivers are never set here'})]]],
  toggle:'Invite them to the owner portal'};
CREATE.push(['owner','Add an owner','Owner-operator, fleet owner or investor','owner','owners']);

// ================================================================ round 5: one person, many roles · owners v2 · pay · teams
// People are stored once. A person can be a driver, an owner, an employee and a portal user at the same time.
I.owner = 'M3 8h18v12H3zM8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18M11 12v3h2v-3';
T.id = (v, s, go, idc) => ({isId:1, v, s:s || '', go, idc:idc || ''});
I.panelR = 'M3 4h18v16H3zM9 4v16M13 9l3 3-3 3';
I.users = 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75';

// ---------------------------------------------------------------- team drivers (two drivers, one truck, split pay)
DRIVERS.push(
  {n:'Darius Johnson',i:'DJ',t:'1171',tr:'5326',st:'On load · driving',sk:'transit',term:'Dallas',ph:'(214) 555-0119',cdl:'A · TX',q:[['ok','Apr 2029'],['ok','Jan 2027'],['ok','Mar 2027'],['ok','Feb 2027'],['ok','On file'],['ok','On file']],tg:1,app:1,lic:'3381',hired:'Jan 2023',emp:'D-1079'},
  {n:'Nia Johnson',i:'NJ',t:'1171',tr:'5326',st:'On load · sleeper',sk:'transit',term:'Dallas',ph:'(214) 555-0128',cdl:'A · TX',q:[['ok','Apr 2029'],['ok','Feb 2027'],['ok','Mar 2027'],['ok','Feb 2027'],['ok','On file'],['ok','On file']],tg:1,app:1,lic:'3382',hired:'Jan 2023',emp:'D-1080'});
Object.assign(DRV_X, {'Darius Johnson':['djohnson',''], 'Nia Johnson':['njohnson','H']});
TRUCKS.push(['T-1171','Freightliner Cascadia · 2024','TX · S5V 1171','Assigned','assigned','Dallas','64,210','FF-24849','PM-A in 12,400 mi','mu','Live']);
TRUCK_X['T-1171'] = ['RS1171','Cascadia 126 · sleeper','06/27','','Meridian, MS','Live · 64 mph','ok'];
const TEAM_OF = {'Darius Johnson':'Nia Johnson', 'Nia Johnson':'Darius Johnson', 'Ken Ito':'Katie Walsh', 'Katie Walsh':'Ken Ito'};
const TRUCK_TEAM = {'T-1171':['Darius Johnson','Nia Johnson','50/50'], 'T-1180':['Ken Ito','Katie Walsh','By miles each drove']};
const OP_DRIVERS = {'Tom Reyes':'TR', 'Luis Ortega':'LO'};   // drivers who are also owners: one person, two roles

// ---------------------------------------------------------------- VINs, so tables can show the real thing
const VIN_WMI = {Freightliner:'3AKJHHDR', Kenworth:'1XKYD49X', Peterbilt:'1XPBD49X', Volvo:'4V4NC9EH', International:'3HSDZAPR', Mack:'1M1AN4GY', Utility:'1UYVS253', Wabash:'1JJV532D', 'Great Dane':'1GRAA062', 'Hyundai Translead':'3H3V532C', Fontaine:'13N14830', Polar:'1PMS4422'};
const VIN_YR = {2019:'K', 2020:'L', 2021:'M', 2022:'N', 2023:'P', 2024:'R'};
const vinOf = (make, year, unit) => { const d = parseInt(String(unit).replace(/\D/g, ''), 10) || 1; return (VIN_WMI[make] || '1FUJGLDR') + String(d % 9) + (VIN_YR[year] || 'N') + 'S' + String(100000 + (d * 7919) % 900000); };

// ---------------------------------------------------------------- agreement terms (per unit, never per person)
// who pays what is spelled out so load revenue, Lone Star's share, driver pay and the owner's settlement never blur
const TERMS = {
  op70:{l:'Owner-operator lease', s:'70% of line haul + 100% of fuel surcharge', pct:0.70, fsc:1, acc:1, fuelBy:'owner', driverBy:'owner', esc:2500},
  op72:{l:'Owner-operator lease', s:'72% of line haul + 100% of fuel surcharge', pct:0.72, fsc:1, acc:1, fuelBy:'owner', driverBy:'owner', esc:2500},
  eq30:{l:'Equipment lease · company driver', s:'30% of line haul; Lone Star pays the driver and fuel', pct:0.30, fsc:0, acc:0, fuelBy:'carrier', driverBy:'carrier', esc:0},
  fl72:{l:'Fleet lease · owner’s drivers', s:'72% of line haul + 100% of fuel surcharge', pct:0.72, fsc:1, acc:1, fuelBy:'owner', driverBy:'owner', esc:2500},
  rent:{l:'Equipment rental', s:'$0.30 a mile for trucks · $425 a week for trailers', pct:0, fsc:0, acc:0, fuelBy:'carrier', driverBy:'carrier', esc:0, perMile:0.30, perWeek:425},
};
// [unit] → everything about the unit this round needs
const U5 = {};
const u5 = (u, o) => { U5[u] = o; };
u5('T-1129',{owner:'TR', kind:'truck', year:2021, make:'Peterbilt', model:'579', plate:'R1F 6630', st:'TX', exp:'02/27', driver:'Tom Reyes', co:'', works:'owner', terms:'op70', since:'Apr 2018', pctOwn:100, lh:4880, fsc:620, acc:0, mi:1190, loads:3, fuel:686.40, ins:171, eld:38, plates:51, escw:0, repair:0, status:'On hold', sk:'hold', loc:'Garland, TX', fresh:'Live · parked 3 h', fk:'ok', load:'FF-24833', lane:'Garland → Lubbock', next:'PM-A in 3,800 mi', odo:'351,027', lat:32.91, lon:-96.64});
u5('T-1102',{owner:'TR', kind:'truck', year:2021, make:'Freightliner', model:'Cascadia 126', plate:'R4K 2291', st:'TX', exp:'03/27', driver:'Sam Whitfield', co:'', works:'company', terms:'eq30', since:'Mar 2026', pctOwn:100, lh:3960, fsc:520, acc:0, mi:1488, loads:6, fuel:861.70, drvPay:922.56, ins:148, eld:0, plates:0, escw:0, repair:0, status:'Assigned', sk:'assigned', loc:'Waco, TX', fresh:'Live · 1 min', fk:'ok', load:'FF-24866', lane:'Waco → Dallas', next:'PM-B in 1,120 mi', odo:'412,880', lat:31.55, lon:-97.15});
u5('T-1133',{owner:'LO', kind:'truck', year:2023, make:'Freightliner', model:'Cascadia 126', plate:'S7D 0092', st:'TX', exp:'07/27', driver:'Luis Ortega', co:'', works:'owner', terms:'op72', since:'Nov 2020', pctOwn:100, lh:6120, fsc:790, acc:0, mi:2180, loads:4, fuel:842.00, ins:171, eld:38, plates:51, escw:78, repair:0, status:'Assigned', sk:'assigned', loc:'Irving, TX', fresh:'Live · at the dock', fk:'ok', load:'FF-24828', lane:'Irving → Little Rock', next:'PM-A in 9,000 mi', odo:'141,380', lat:32.81, lon:-96.95});
u5('T-1108',{owner:'JH', kind:'truck', year:2022, make:'Freightliner', model:'Cascadia 126', plate:'R4M 8810', st:'TX', exp:'01/27', driver:'Ana Ruiz', co:'', works:'company', terms:'eq30', since:'Feb 2025', pctOwn:100, lh:5780, fsc:760, acc:0, mi:2210, loads:6, fuel:1279.80, drvPay:1370.20, ins:148, eld:0, plates:0, escw:0, repair:0, status:'Assigned', sk:'assigned', loc:'Ardmore, OK', fresh:'Live · 61 mph', fk:'ok', load:'FF-24817', lane:'Fort Worth → Oklahoma City', next:'PM-A in 6,300 mi', odo:'318,402', lat:34.17, lon:-97.13});
u5('T-1121',{owner:'JH', kind:'truck', year:2022, make:'Kenworth', model:'T680', plate:'R9C 1205', st:'TX', exp:'09/27', driver:'Jamal Carter', co:'', works:'company', terms:'eq30', since:'Feb 2025', pctOwn:100, lh:4760, fsc:620, acc:0, mi:1904, loads:5, fuel:1102.60, drvPay:1218.56, ins:148, eld:0, plates:0, escw:0, repair:0, status:'Assigned', sk:'assigned', loc:'Temple, TX', fresh:'Live · 58 mph', fk:'ok', load:'FF-24839', lane:'Lewisville → Austin', next:'DOT annual in 11 d', odo:'276,115', lat:31.10, lon:-97.34});
u5('T-1142',{owner:'JH', kind:'truck', year:2023, make:'Kenworth', model:'T680', plate:'S1A 7781', st:'TX', exp:'08/27', driver:'Marcus Bell', co:'', works:'company', terms:'eq30', since:'Feb 2025', pctOwn:100, lh:6215, fsc:810, acc:0, mi:2486, loads:7, fuel:1439.60, drvPay:1541.32, ins:148, eld:0, plates:0, escw:0, repair:1214.80, rnote:'WO-1186 · drive tires, owner’s cost under the lease', status:'Assigned', sk:'assigned', loc:'Spring, TX', fresh:'Live · 64 mph', fk:'ok', load:'FF-24801', lane:'Dallas → Houston', next:'PM-A in 7,450 mi', odo:'122,904', lat:30.08, lon:-95.42});
u5('T-1168',{owner:'CT', kind:'truck', year:2022, make:'Freightliner', model:'Cascadia 126', plate:'S2C 1168', st:'TX', exp:'04/27', driver:'Rafael Gomez', co:'', works:'ownerhire', terms:'fl72', since:'Mar 2024', pctOwn:100, lh:6620, fsc:860, acc:0, mi:2310, loads:4, fuel:1337.70, drvPay:1386.00, payRun:1, ins:171, eld:38, plates:53, escw:0, repair:0, status:'In transit', sk:'transit', loc:'Huntsville, TX', fresh:'Live · 62 mph', fk:'ok', load:'FF-24852', lane:'Houston → Dallas', next:'PM-A in 3,400 mi', odo:'287,330', lat:30.72, lon:-95.55});
u5('T-1174',{owner:'CT', kind:'truck', year:2021, make:'Kenworth', model:'T680', plate:'R7D 1174', st:'TX', exp:'10/27', driver:'Dwayne Hill', co:'', works:'ownerhire', terms:'fl72', since:'Mar 2024', pctOwn:100, lh:6050, fsc:780, acc:90, mi:2105, loads:3, fuel:1219.00, drvPay:1263.00, payRun:1, ins:171, eld:38, plates:53, escw:0, repair:486.50, rnote:'WO-1179 · brake chambers, approved Nov 5', status:'Assigned', sk:'assigned', loc:'Irving yard', fresh:'Live · parked 2 h', fk:'ok', load:'FF-24879', lane:'Irving → Little Rock', next:'Brakes done Nov 5', odo:'333,018', lat:32.84, lon:-96.98});
u5('T-1177',{owner:'CT', kind:'truck', year:2023, make:'Volvo', model:'VNL 760', plate:'S4F 1177', st:'TX', exp:'12/27', driver:'Paul Mendez', co:'', works:'ownerhire', terms:'fl72', since:'Jun 2024', pctOwn:100, lh:5320, fsc:690, acc:95, mi:1880, loads:3, fuel:1088.70, drvPay:1128.00, payRun:1, ins:171, eld:38, plates:53, escw:0, repair:0, status:'Available', sk:'ok', loc:'Dallas yard', fresh:'Live · parked since 06:10', fk:'ok', load:'', lane:'', next:'PM-A in 9,100 mi', odo:'168,442', lat:32.78, lon:-96.80});
u5('T-1180',{owner:'CT', kind:'truck', year:2022, make:'International', model:'LT625', plate:'S6K 1180', st:'TX', exp:'07/27', driver:'Ken Ito', co:'Katie Walsh', works:'ownerhire', terms:'fl72', since:'Aug 2026', pctOwn:100, lh:13650, fsc:1780, acc:125, mi:4960, loads:3, fuel:2872.40, drvPay:3472.00, payRun:1, team:'By miles each drove · Ken 2,610 mi, Katie 2,350 mi', ins:171, eld:38, plates:53, escw:0, repair:0, status:'In transit', sk:'transit', loc:'Austin, TX', fresh:'Live · 58 mph', fk:'ok', load:'FF-24861', lane:'Waco → San Antonio', next:'DOT annual in 26 d', odo:'402,915', lat:30.27, lon:-97.74});
u5('T-1149',{owner:'PC', kind:'truck', year:2021, make:'Volvo', model:'VNL 760', plate:'R6H 5502', st:'TX', exp:'05/27', driver:'Devon Price', co:'', works:'company', terms:'rent', since:'Jan 2025', pctOwn:100, lh:4420, fsc:560, acc:0, mi:1702, loads:4, fuel:985.60, drvPay:987.16, ins:155, eld:0, plates:0, escw:0, repair:0, status:'Available', sk:'ok', loc:'Dallas, TX', fresh:'Stale · 47 min', fk:'warn', load:'', lane:'', next:'Return-to-service check', odo:'366,213', lat:32.70, lon:-96.88});
u5('T-1190',{owner:'PC', kind:'truck', year:2022, make:'Kenworth', model:'T680', plate:'S3P 1190', st:'TX', exp:'11/27', driver:'Hannah Scott', co:'', works:'company', terms:'rent', since:'Jan 2025', pctOwn:100, lh:6010, fsc:760, acc:0, mi:2288, loads:3, fuel:1325.10, drvPay:1395.68, ins:155, eld:0, plates:0, escw:0, repair:0, status:'In transit', sk:'transit', loc:'Wichita Falls, TX', fresh:'Live · 66 mph', fk:'ok', load:'FF-24864', lane:'Fort Worth → Amarillo', next:'PM-A in 5,200 mi', odo:'240,776', lat:33.91, lon:-98.49});
u5('TR-5302',{owner:'PC', kind:'trailer', year:2021, make:'Great Dane', model:'Everest reefer', ttype:'Reefer', len:'53’', plate:'1XH 5302', st:'TX', exp:'01/27', driver:'', co:'', works:'', terms:'rent', since:'Jan 2025', pctOwn:100, status:'Empty', sk:'ok', loc:'Houston yard', fresh:'Reefer unit off', fk:'warn', next:'Reefer PM in 120 h', lat:29.76, lon:-95.37});
u5('TR-5340',{owner:'PC', kind:'trailer', year:2020, make:'Fontaine', model:'Infinity', ttype:'Flatbed', len:'48’', plate:'1XG 5340', st:'TX', exp:'03/27', driver:'', co:'', works:'', terms:'rent', since:'Jan 2025', pctOwn:100, status:'Empty', sk:'ok', loc:'Dallas yard', fresh:'No tracker', fk:'mu', next:'Tarp & strap check', lat:32.78, lon:-96.80});
u5('TR-5341',{owner:'PC', kind:'trailer', year:2022, make:'Fontaine', model:'Velocity', ttype:'Step deck', len:'48’', plate:'1XK 5341', st:'TX', exp:'08/27', driver:'', co:'', works:'', terms:'rent', since:'May 2026', pctOwn:100, status:'Empty', sk:'ok', loc:'Dallas yard', fresh:'Live', fk:'ok', next:'Inspection in 5 mo', lat:32.78, lon:-96.80});
u5('TR-5343',{owner:'PC', kind:'trailer', year:2021, make:'Polar', model:'7,000 gal aluminum', ttype:'Tanker', len:'42’', plate:'1XH 5343', st:'TX', exp:'06/27', driver:'', co:'', works:'', terms:'rent', since:'May 2026', pctOwn:100, status:'Empty', sk:'ok', loc:'Dallas yard', fresh:'Live', fk:'ok', next:'Tank inspection in 21 d', lat:32.78, lon:-96.80});
u5('T-1186',{owner:'AR', kind:'truck', year:2020, make:'Peterbilt', model:'579', plate:'P5R 1186', st:'TX', exp:'05/27', driver:'Jerome Banks', co:'', works:'ownerhire', terms:'fl72', since:'Jun 2025', pctOwn:100, lh:5940, fsc:760, acc:0, mi:2050, loads:4, fuel:1203.10, drvPay:0, payRun:0, ins:171, eld:38, plates:53, escw:0, repair:0, status:'In transit', sk:'transit', loc:'Marshall, TX', fresh:'Live · 63 mph', fk:'ok', load:'FF-24858', lane:'Dallas → Shreveport', next:'PM-B in 2,600 mi', odo:'455,210', lat:32.54, lon:-94.37});
u5('T-1195',{owner:'MB', kind:'truck', year:2019, make:'Peterbilt', model:'389', plate:'P9M 1195', st:'TX', exp:'09/27', driver:'Maya Brooks', co:'', works:'owner', terms:'op70', since:'Pending', pctOwn:100, status:'Not in service', sk:'mu', loc:'Mesquite, TX', fresh:'Waiting on the lease', fk:'mu', load:'', lane:'', next:'DOT annual on file', odo:'612,447', lat:32.77, lon:-96.60});
Object.keys(U5).forEach(u => { const x = U5[u]; x.u = u; x.vin = vinOf(x.make, x.year, u); });
// owners' trucks join the fleet tables, and the drivers owners hire join the driver directory:
// they drive under Lone Star's authority, so Lone Star keeps their qualification file even when the owner pays them
['T-1168','T-1174','T-1177','T-1180','T-1186','T-1190'].forEach(u => { const x = U5[u];
  if (TRUCKS.some(t => t[0] === u)) return;
  TRUCKS.push([u, x.make + ' ' + x.model + ' · ' + x.year, x.st + ' · ' + x.plate, x.status, x.sk, x.loc.split(',')[0].replace(' yard', ''), x.odo, x.load || '—', x.next, /in \d+ d/.test(x.next) ? 'warn' : 'mu', 'Live']);
  TRUCK_X[u] = [x.vin.slice(-6), x.model, x.exp, '', x.loc, x.fresh, x.fk]; });
const QOK = [['ok','Mar 2029'],['ok','Jun 2027'],['ok','Apr 2027'],['ok','Feb 2027'],['ok','On file'],['ok','On file']];
DRIVERS.push(
  {n:'Rafael Gomez',i:'RG',t:'1168',tr:'5307',st:'On load',sk:'transit',term:'Houston',ph:'(956) 555-0161',cdl:'A · TX',q:QOK,tg:1,app:1,lic:'7710',hired:'Mar 2024',emp:'D-1121'},
  {n:'Dwayne Hill',i:'DH',t:'1174',tr:'5312',st:'Starts Nov 14',sk:'assigned',term:'Dallas',ph:'(956) 555-0177',cdl:'A · TX',q:[['ok','Aug 2028'],['warn','21 days'],['ok','May 2027'],['ok','Feb 2027'],['ok','On file'],['ok','On file']],tg:0,app:1,lic:'7731',hired:'Mar 2024',emp:'D-1122'},
  {n:'Paul Mendez',i:'PM',t:'1177',tr:'—',st:'Available',sk:'ok',term:'Dallas',ph:'(956) 555-0183',cdl:'A · TX',q:QOK,tg:1,app:1,lic:'7745',hired:'Jun 2024',emp:'D-1123'},
  {n:'Ken Ito',i:'KI',t:'1180',tr:'5317',st:'On load · driving',sk:'transit',term:'Dallas',ph:'(956) 555-0190',cdl:'A · TX',q:QOK,tg:1,app:1,lic:'7802',hired:'Aug 2026',emp:'D-1131'},
  {n:'Katie Walsh',i:'KW',t:'1180',tr:'5317',st:'On load · sleeper',sk:'transit',term:'Dallas',ph:'(956) 555-0194',cdl:'A · TX',q:[['ok','Oct 2028'],['ok','Jul 2027'],['ok','Jun 2027'],['ok','Feb 2027'],['ok','On file'],['ok','On file']],tg:0,app:1,lic:'7803',hired:'Aug 2026',emp:'D-1132'},
  {n:'Jerome Banks',i:'JB',t:'1186',tr:'5319',st:'On load',sk:'transit',term:'Dallas',ph:'(214) 555-0158',cdl:'A · TX',q:QOK,tg:0,app:1,lic:'7820',hired:'Jun 2025',emp:'D-1110'},
  {n:'Hannah Scott',i:'HS',t:'1190',tr:'5301',st:'On load',sk:'transit',term:'Dallas',ph:'(469) 555-0142',cdl:'A · TX',q:[['ok','Feb 2030'],['ok','Sep 2027'],['ok','Aug 2027'],['ok','Mar 2027'],['ok','On file'],['ok','On file']],tg:1,app:1,lic:'7841',hired:'Jan 2025',emp:'D-1105'});
Object.assign(DRV_X, {'Rafael Gomez':['rgomez',''], 'Dwayne Hill':['dhill','N'], 'Paul Mendez':['pmendez',''], 'Ken Ito':['kito','H'], 'Katie Walsh':['kwalsh','H'], 'Jerome Banks':['jbanks',''], 'Hannah Scott':['hscott','T']});
const HIRED_BY = {'Rafael Gomez':'CT', 'Dwayne Hill':'CT', 'Paul Mendez':'CT', 'Ken Ito':'CT', 'Katie Walsh':'CT', 'Jerome Banks':'AR'};

// ---------------------------------------------------------------- owners: individuals and businesses
const OWN5 = [
  {id:'LSF', entity:'business', name:'Lone Star Freight LLC', cat:'carrier', city:'Dallas', state:'TX', zip:'75207', status:'Active', sk:'ok', trucks:28, trailers:60, since:'2014'},
  {id:'TR', entity:'individual', first:'Tom', last:'Reyes', name:'Tom Reyes', dba:'Reyes Trucking', cat:'op', email:'tom.reyes@example.com', ph:'(972) 555-0148', addr:'2217 Lakeview Dr', city:'Garland', state:'TX', zip:'75040', tax:'SSN ending 2093', since:'Apr 2018', status:'Active', sk:'ok', person:'Tom Reyes', roles:['Owner','Driver'], drives:'Drives T-1129 · Sam Whitfield (company) drives T-1102', portal:'Active', pk:'ok'},
  {id:'LO', entity:'individual', first:'Luis', last:'Ortega', name:'Luis Ortega', dba:'', cat:'op', email:'luis.ortega@example.com', ph:'(214) 555-0175', addr:'915 Kessler Pkwy', city:'Dallas', state:'TX', zip:'75208', tax:'SSN ending 4406', since:'Nov 2020', status:'Active', sk:'ok', person:'Luis Ortega', roles:['Owner','Driver'], drives:'Drives T-1133 himself', portal:'Active', pk:'ok'},
  {id:'JH', entity:'individual', first:'James', last:'Holloway', name:'James Holloway', dba:'', cat:'nonop', email:'james.holloway@example.com', ph:'(903) 555-0137', addr:'408 Azalea Ln', city:'Tyler', state:'TX', zip:'75701', tax:'SSN ending 5518', since:'Feb 2025', status:'Active', sk:'ok', person:'James Holloway', roles:['Owner'], drives:'Lone Star’s drivers on all 3', portal:'Active', pk:'ok'},
  {id:'CT', entity:'business', name:'Castillo Transport LLC', dba:'', cat:'nonop', contact:'Hector Castillo', ctitle:'Principal', email:'hector.castillo@example.com', ph:'(956) 555-0142', addr:'5120 Mines Rd', city:'Laredo', state:'TX', zip:'78041', tax:'EIN ending 4417', since:'Mar 2024', status:'Active', sk:'ok', roles:['Owner'], drives:'5 drivers Castillo hires, one team', portal:'Active · 2 users', pk:'ok', payRun:true},
  {id:'PC', entity:'business', name:'Pecan Creek Equipment LLC', dba:'', cat:'nonop', contact:'Linda Tran', ctitle:'Managing member', email:'linda.tran@example.com', ph:'(512) 555-0183', addr:'300 Congress Ave, Ste 410', city:'Austin', state:'TX', zip:'78701', tax:'EIN ending 6150', since:'Jan 2025', status:'Active', sk:'ok', roles:['Owner'], drives:'Lone Star’s drivers', portal:'Active', pk:'ok'},
  {id:'AR', entity:'individual', first:'Alex', last:'Rivera', name:'Alex Rivera', dba:'', cat:'nonop', email:'alex.rivera@example.com', ph:'(214) 555-0166', addr:'6203 Belmont Ave', city:'Dallas', state:'TX', zip:'75214', tax:'SSN ending 7731', since:'Jun 2025', status:'Active', sk:'ok', person:'Alex Rivera', roles:['Owner','Employee'], drives:'Jerome Banks, hired and paid by Alex', portal:'Active', pk:'ok'},
  {id:'MB', entity:'individual', first:'Maya', last:'Brooks', name:'Maya Brooks', dba:'Brooks Hauling', cat:'op', email:'maya.brooks@example.com', ph:'(469) 555-0121', addr:'1306 Gus Thomasson Rd', city:'Mesquite', state:'TX', zip:'75150', tax:'SSN ending 3302', since:'—', status:'Onboarding', sk:'info', person:'Maya Brooks', roles:['Owner','Driver'], drives:'Will drive T-1195 herself', portal:'Invited', pk:'warn'},
  {id:'KL', entity:'business', name:'Kowalski Leasing Inc.', dba:'', cat:'nonop', contact:'Pete Kowalski', ctitle:'President', email:'pete.kowalski@example.com', ph:'(817) 555-0175', addr:'2900 W 7th St', city:'Fort Worth', state:'TX', zip:'76107', tax:'EIN ending 8841', since:'Feb 2022', status:'Ended', sk:'mu', roles:['Owner'], drives:'—', portal:'Read-only to Dec 31', pk:'mu'},
];
const own5 = id => OWN5.find(o => o.id === id);
const unitsOf = id => Object.values(U5).filter(x => x.owner === id);
const ownerOfUnit = u => U5[u] ? own5(U5[u].owner) : own5('LSF');
const CAT5 = {carrier:'Company fleet', op:'Owner-operator', nonop:'Non-operating owner'};

// ---------------------------------------------------------------- the money engine: one place that splits every dollar
// load revenue (what customers pay) → Lone Star's share | owner gross → owner deductions → owner net settlement
// driver pay is separate: company drivers are paid by Lone Star; owners' drivers are paid by the owner (or by Lone Star for them and charged back)
function money(x) {
  const t = TERMS[x.terms];
  if (!t || x.kind !== 'truck' && x.terms !== 'rent') return null;
  if (x.kind === 'trailer') return {rev:0, carrier:0, gross:t.perWeek, ded:0, net:t.perWeek, drvPay:0, drvBy:'', fuelCarrier:0, lines:[['Trailer rental · 1 week', '$425 a week', t.perWeek]], dlines:[]};
  const rev = (x.lh || 0) + (x.fsc || 0) + (x.acc || 0);
  let gross, lines = [];
  if (x.terms === 'rent') { gross = Math.round(x.mi * t.perMile * 100) / 100; lines.push(['Truck rental · ' + n0f(x.mi) + ' mi', '$0.30 a mile', gross]); }
  else {
    const lhS = Math.round(x.lh * t.pct * 100) / 100;
    lines.push(['Line haul · ' + x.loads + (x.loads === 1 ? ' load' : ' loads'), fm2(x.lh) + ' × ' + Math.round(t.pct * 100) + '%', lhS]);
    if (t.fsc && x.fsc) lines.push(['Fuel surcharge', '100% passed through', x.fsc]);
    if (t.acc && x.acc) lines.push(['Detention and lumper', 'Passed through', x.acc]);
    gross = lhS + (t.fsc ? x.fsc || 0 : 0) + (t.acc ? x.acc || 0 : 0);
  }
  gross = Math.round(gross * 100) / 100;
  const ded = [];
  if (t.fuelBy === 'owner' && x.fuel) ded.push(['Fuel', 'WEX card purchases on ' + x.u, -x.fuel]);
  if (x.payRun && x.drvPay) ded.push(['Driver pay Lone Star ran for the owner', (x.co ? x.driver + ' and ' + x.co + ' (team)' : x.driver), -x.drvPay]);
  if (x.ins) ded.push(['Insurance', t.driverBy === 'carrier' ? 'Physical damage' : 'Physical damage, occupational accident', -x.ins]);
  if (x.eld) ded.push(['ELD and telematics', '', -x.eld]);
  if (x.plates) ded.push(['IRP plates and permits', 'Weekly share', -x.plates]);
  if (x.repair) ded.push(['Repair', x.rnote || '', -x.repair]);
  if (x.escw) ded.push(['Escrow deposit', 'Building to $2,500', -x.escw]);
  const dsum = Math.round(ded.reduce((a, d) => a + d[2], 0) * 100) / 100;
  const carrier = Math.round((rev - gross) * 100) / 100;
  return {rev, carrier, gross, ded:dsum, net:Math.round((gross + dsum) * 100) / 100, lines, dlines:ded, drvPay:x.drvPay || 0, drvBy: t.driverBy === 'carrier' ? 'Lone Star' : (x.payRun ? 'Lone Star, for the owner' : (x.works === 'owner' ? 'Owner (drives it)' : 'Owner, outside FlyFleet')), fuelCarrier: t.fuelBy === 'carrier' ? x.fuel || 0 : 0};
}
function ownerWeek(id) {
  const us = unitsOf(id).filter(x => x.since !== 'Pending');
  const per = us.map(x => ({x, m:money(x)})).filter(r => r.m);
  const sum = k => Math.round(per.reduce((a, r) => a + (r.m[k] || 0), 0) * 100) / 100;
  return {per, rev:sum('rev'), carrier:sum('carrier'), gross:sum('gross'), ded:sum('ded'), net:sum('net'), drvPayCarrier: Math.round(per.filter(r => TERMS[r.x.terms].driverBy === 'carrier').reduce((a, r) => a + r.m.drvPay, 0) * 100) / 100,
    drvPayRun: Math.round(per.filter(r => r.x.payRun).reduce((a, r) => a + r.m.drvPay, 0) * 100) / 100, fuelCarrier:sum('fuelCarrier')};
}
const ESCROW = {TR:[2500,2500], LO:[1872,2500], CT:[10000,10000], AR:[2500,2500], JH:[0,0], PC:[0,0], MB:[0,2500], KL:[5000,0]};

// ---------------------------------------------------------------- owner portal permissions (set by the Main Admin, enforced by the API)
const PERMS = [['equipment','View owned equipment'],['locations','View live truck locations'],['drivers','View assigned drivers'],['loads','View loads'],['completed','View completed loads'],['fuel','View fuel transactions'],['expenses','View expenses'],['statements','View financial statements'],['maintenance','View maintenance records'],['documents','View documents'],['download','Download statements'],['performance','View performance reports']];
const PERM_ALL = PERMS.map(p => p[0]);
const PERM_DEF = {TR:PERM_ALL, LO:PERM_ALL, CT:PERM_ALL, AR:PERM_ALL, JH:PERM_ALL.filter(k => k !== 'drivers'), PC:PERM_ALL.filter(k => k !== 'drivers' && k !== 'fuel'), MB:['equipment','documents'], KL:['statements','download','documents']};
const PERM_PRESETS = [['Full owner', PERM_ALL], ['Monitor only', ['equipment','locations','loads','completed','maintenance','performance']], ['Bookkeeper', ['statements','fuel','expenses','documents','download']]];
const permOf = (fv, id) => PERMS.reduce((a, [k]) => { const v = fv['perm.' + id + '.' + k]; a[k] = v !== undefined ? v === 'on' : (PERM_DEF[id] || []).includes(k); return a; }, {});

// ---------------------------------------------------------------- history for charts: Jun–Nov (Nov = Nov 1–13)
const MON = ['Jun','Jul','Aug','Sep','Oct','Nov'];
const MWK = [4.3, 4.4, 4.4, 4.3, 4.4, 1.9];
const jit = (s, i) => 1 + (((s * 9301 + i * 49297 + 233) % 233280) / 233280 - 0.5) * 0.16;
const sinceIdx = s => { const m = /^(\w{3}) (\d{4})$/.exec(s || ''); if (!m) return -1; if (+m[2] < 2026) return 0; const i = MON.indexOf(m[1]); return i < 0 ? (['Jan','Feb','Mar','Apr','May'].includes(m[1]) ? 0 : 6) : i; };


// ---------------------------------------------------------------- tables: one fact per column, horizontal scroll, frozen first columns, working tabs and search
const stopGo = fn => e => { if (e && e.stopPropagation) e.stopPropagation(); fn(); };
const lk = (v, go, s) => ({...T.id(v, s || '', stopGo(go)), idc:''});
const nk = (v, go, s) => ({...T.id(v, s || '', stopGo(go)), idc:'nm'});
const mu = v => T.tx(v || '—', '', v ? '' : 'mu');
const acts = list => ({isActs:1, acts:list.map(([l, go, cls]) => ({l, go:stopGo(go), cls:cls || ''})), al:''});
function tabbed(L, X, defs, rowsAll) {
  const {c, ltab, lq} = X;
  const ti = Math.min(ltab || 0, defs.length - 1);
  const q = String(lq || '').trim().toLowerCase();
  L.tabs = defs.map(([l, n, f], i) => ({l, n: n !== undefined ? n : String(rowsAll.filter(f).length), on: i === ti ? 'on' : '', go:() => c.ltab(i)}));
  L.rows = rowsAll.filter(defs[ti][2]).filter(r => !q || (r.q || '').indexOf(q) >= 0);
  L.setQ = e => c.lq(e && e.target ? e.target.value : '');
  L.qv = lq || '';
  return L;
}
const ownerCell5 = (u, c) => { const o = ownerOfUnit(u); return o.cat === 'carrier' ? T.tx('Company fleet', '', 'mu') : nk(o.name, () => c.owner(o.id)); };
const loadCell = (id, c) => !id || id === '—' ? mu('') : (LOADS.find(l => l.id === id) ? lk(id, () => c.open(id)) : T.tx(id, '', 'mono fs12'));
const drvCell = (n, c) => { if (!n) return T.tx('No driver', '', 'mu'); const d = DRIVERS.find(x => x.n === n); return d ? nk(n, () => c.driver(n)) : T.tx(n); };

const buildList4 = buildList;
buildList = function (screen, X) {
  const {fin, c, team} = X;
  const A = (l, cls, ic, go) => ({l, cls:cls||'', ic:ic||'', go:go||noop});
  if (!['trucks','trailers','drivers','owners','customers','settlements'].includes(screen)) return buildList4(screen, X);
  const L = {...buildList4(screen === 'owners' ? 'customers' : screen, X), band:null, callout:null, chips:[], hidden:'', fz:'fz2', scroll:true};

  if (screen === 'trucks') {
    const rows = TRUCKS.filter(x => inTeam(team, x[0])).map(([u, mm, pl, st, k, , odo, asg, nx, nk]) => {
      const [, model, exp, ek, loc, live, lk2] = TRUCK_X[u], [make, year] = mm.split(' · '), mk = make.split(' ')[0], [ps, plate] = pl.split(' · ');
      const x5 = U5[u], tm = TRUCK_TEAM[u], d = tm ? tm[0] : (DRIVERS.find(dd => 'T-' + dd.t === u) || {}).n, co = tm ? tm[1] : '';
      const o = ownerOfUnit(u), share = o.cat === 'carrier' ? 'Company' : (x5 ? x5.pctOwn + '%' : '100%');
      return {key:u, open:() => c.truck(u), q:[u, mk, model, plate, d, co, o.name, loc].join(' ').toLowerCase(), k, ownerCat:o.cat, sk:{unit:u, year:+year, make:mk, own:o.cat === 'carrier' ? 'zzz' : o.name, odo:+odo.replace(/,/g, '')},
        cells:[T.tx(u, '', 'mono w5'), T.b(st, k), drvCell(d, c), co ? drvCell(co, c) : mu(''), loadCell(asg, c), T.tx(loc, live, '', tone(lk2)), ownerCell5(u, c), T.tx(share, '', share === 'Company' ? 'mu' : 'num'),
          T.tx(year, '', 'num'), T.tx(mk), T.tx(model.replace(' · sleeper', '')), T.tx(vinOf(mk, +year, u), '', 'mono fs12 t2'), T.tx(plate, '', 'mono fs12'), T.tx(ps, '', 'mono fs12 t2'), T.tx(exp, '', 'mono fs12 ' + (ek ? 'sk-warn' : 't2')),
          T.n(odo), T.tx(nx.replace('Annual inspection', 'DOT annual'), '', nk === 'mu' ? '' : tone(nk === 'bad' ? 'bad' : 'warn')), T.more()]};
    });
    Object.assign(L, {cols:'76px 128px 150px 140px 96px 176px 176px 84px 52px 112px 128px 172px 92px 52px 76px 92px 176px 28px',
      head:[H('Unit'),H('Status'),H('Driver'),H('Co-driver'),H('Load'),H('Location'),H('Owner'),H('Ownership'),H('Year'),H('Make'),H('Model'),H('VIN'),H('Plate'),H('State'),H('Plate exp.'),H('Odometer',1),H('Next service'),H('')],
      sub:(team ? team.name + ' · 14 trucks' : '41 trucks · 28 company-owned, 13 owned by 6 outside owners') + ' · trucks out of service or in the shop can’t be dispatched', ph:'Unit, VIN, plate, driver or owner',
      kpis: team ? L.kpis : [
        {label:'On loads now', value:'31', suffix:' of 41', sub:'76% utilization · 72% last week', k:'brand', sk:'ok'},
        {label:'Available', value:'6', suffix:'', sub:'4 in Dallas · 2 heading home', k:'ok', sk:'mu'},
        {label:'In the shop', value:'4', suffix:'', sub:'3 in maintenance · 1 out of service', k:'warn', sk:'mu'},
        {label:'Team trucks', value:'2', suffix:'', sub:'T-1171 Johnsons · T-1180 Castillo team', k:'violet', sk:'mu'},
        {label:'Owned by outside owners', value:'13', suffix:' of 41', sub:'6 owners · 28 company-owned', k:'teal', sk:'mu'}], kpiN: team ? 4 : 5,
      adds:['Status','Make','Year','Owner'], foot:'', minw:''});
    tabbed(L, X, [['All','41',() => true],['Available','6',r => r.k === 'ok'],['On a load','31',r => r.k === 'assigned' || r.k === 'transit'],['In the shop','4',r => r.k === 'warn' || r.k === 'bad'],['Owner trucks',undefined,r => r.ownerCat !== 'carrier'],['Team trucks',undefined,r => !!TRUCK_TEAM[r.key]]], rows);
    L.foot = 'Showing ' + L.rows.length + ' of ' + (L.tabs.find(t => t.on) || {}).n + ' · scroll sideways for more columns';
    sortable(L, X, ['unit',null,null,null,null,null,'own',null,'year','make',null,null,null,null,null,'odo'], {k:'unit', dir:1});
    return selectable(L, X, ['Assign to a team','Schedule service','Change status','Export']);
  }

  if (screen === 'trailers') {
    const rows = TRAILERS.map(([u, ty, len, year, make, model, plate, exp, st, k, trk, ld, nx, nk, tel, loc, tk]) => { const o = ownerOfUnit(u);
      return {key:u, open:noop, q:[u, ty, make, model, plate, trk, o.name].join(' ').toLowerCase(), k, ty, ownerCat:o.cat, sk:{unit:u, type:ty, year:+year, make, own:o.cat === 'carrier' ? 'zzz' : o.name},
        cells:[T.tx(u, '', 'mono w5'), T.tx(ty), T.b(st, k), trk ? T.tx(trk, '', 'mono fs12') : mu(''), loadCell(ld, c), T.tx(loc, tel, '', tone(tk)), ownerCell5(u, c), T.tx(len, '', 'num t2'), T.tx(year, '', 'num'), T.tx(make), T.tx(model),
          T.tx(vinOf(make, +year, u), '', 'mono fs12 t2'), T.tx(plate, '', 'mono fs12'), T.tx('TX', '', 'mono fs12 t2'), T.tx(exp, '', 'mono fs12 ' + (exp === '12/26' ? 'sk-warn' : 't2')), T.rk(nx, nk, I.wrench), T.more()]}; });
    Object.assign(L, {cols:'76px 96px 120px 76px 96px 176px 176px 56px 52px 140px 156px 172px 92px 52px 76px 188px 28px',
      head:[H('Unit'),H('Type'),H('Status'),H('Truck'),H('Load'),H('Location'),H('Owner'),H('Length'),H('Year'),H('Make'),H('Model'),H('VIN'),H('Plate'),H('State'),H('Plate exp.'),H('Next service'),H('')],
      sub:'64 trailers · 46 dry vans, 14 reefers, 2 flatbeds, 1 step deck, 1 tanker · 4 owned by Pecan Creek Equipment', ph:'Unit, VIN, plate, truck or owner', adds:['Type','Make','Year','Owner'], minw:''});
    tabbed(L, X, [['All','64',() => true],['Loaded','44',r => r.k === 'assigned' || r.k === 'atpickup'],['Empty','18',r => r.k === 'ok'],['In the shop','2',r => r.k === 'warn'],['Reefers','14',r => r.ty === 'Reefer'],['Owner trailers','4',r => r.ownerCat !== 'carrier']], rows);
    L.foot = 'Showing ' + L.rows.length + ' of ' + (L.tabs.find(t => t.on) || {}).n + ' · scroll sideways for more columns';
    sortable(L, X, ['unit','type',null,null,null,null,'own',null,'year','make'], {k:'unit', dir:1});
    return selectable(L, X, ['Schedule service','Change status','Move to a yard','Export']);
  }

  if (screen === 'drivers') {
    const rows = DRIVERS.filter(d => inTeam(team, d.t)).map(d => {
      const q = qualOf(d), l = loadOf(d.n), pres = d.sk === 'ok' ? 'ok' : (d.sk === 'mu' ? 'mu' : 'brand'), [em, end] = DRV_X[d.n] || ['', ''];
      const unit = d.t === '—' ? '' : 'T-' + d.t, opId = OP_DRIVERS[d.n], tmate = TEAM_OF[d.n], o = unit ? ownerOfUnit(unit) : null;
      const hb = HIRED_BY[d.n], hbo = hb ? own5(hb) : null, x5 = unit ? U5[unit] : null;
      const works = opId ? 'Owner settlement · 1099' : (hb ? (x5 && x5.payRun ? 'Lone Star, charged to ' + hbo.name.split(' ')[0] : hbo.name + ', outside FlyFleet') : 'Lone Star · W-2'), med = d.q[1];
      return {key:d.n, cls: d.st === 'Inactive' ? 'dim' : '', open:() => c.driver(d.n), q:[d.n, d.emp, d.ph, em, unit, tmate].join(' ').toLowerCase(), op:!!opId, team:!!tmate, st:d.st, qk:q.k,
        sk:{name:d.n.split(' ').reverse().join(' '), st:d.st, q:-SEV[q.k], emp:d.emp},
        cells:[T.p(d.n, d.i, '', pres), T.tx(d.emp, '', 'mono fs12'), T.b(d.st, d.sk),
          T.tags([{v: opId ? 'Owner-operator' : (hb ? 'Owner’s driver' : 'Company'), k: opId ? 'brand' : (hb ? 'teal' : 'mu')}]), opId ? nk('Owner · ' + unitsOf(opId).length + (unitsOf(opId).length === 1 ? ' truck' : ' trucks'), () => c.owner(opId)) : (hb ? nk('Hired by ' + (hbo.entity === 'business' ? hbo.name.split(' ')[0] : hbo.name), () => c.owner(hb)) : mu('')),
          tmate ? drvCell(tmate, c) : mu(''), unit ? lk(unit, () => c.truck(unit)) : mu(''), l ? lk(l.id, () => c.open(l.id)) : (x5 && x5.load ? T.tx(x5.load, '', 'mono fs12') : (d.t === '1171' ? T.tx('FF-24849', '', 'mono fs12') : mu(''))),
          T.dots(q.v, d.q.map(x => x[0]), q.k), T.tx(d.ph, '', 'mono fs12'), T.tx(em ? em + (HIRED_BY[d.n] ? '@example.com' : '@lonestarfreight.com') : '—', '', 'fs12 t2'),
          T.tx('Class ' + d.cdl.split(' · ')[0]), T.tx(d.cdl.split(' · ')[1], '', 'mono fs12'), T.tx(end || 'None', '', end ? '' : 'mu'), T.tx(d.q[0][1], '', d.q[0][0] === 'ok' ? 't2' : tone(d.q[0][0])),
          T.tx(med[0] === 'ok' ? med[1] : (med[0] === 'info' ? 'In review' : med[1]), '', med[0] === 'ok' ? 't2' : tone(med[0] === 'bad' ? 'bad' : 'warn')),
          o ? (o.cat === 'carrier' ? T.tx('Company fleet', '', 'mu') : nk(o.name, () => c.owner(o.id))) : mu(''), T.tx(works, '', 't2'), T.tx('', '', 't2'), T.ch(chansOf(d)), T.tx(d.hired, '', 't2'), T.more()]};
    });
    Object.assign(L, {cols:'188px 76px 140px 124px 150px 140px 76px 92px 196px 120px 236px 76px 56px 112px 96px 112px 176px 190px 200px 64px 84px 28px',
      head:[H('Driver'),H('ID'),H('Status'),H('Works as'),H('Also'),H('Team partner'),H('Truck'),H('Load'),H('Qualification'),H('Mobile'),H('Email'),H('CDL'),H('State'),H('Endorsements'),H('CDL expires'),H('Medical card'),H('Truck owner'),H('Paid by'),H('Pay type'),H('Apps'),H('Hired'),H('')],
      sub:(team ? team.name + ' · 14 drivers on the team’s trucks' : '44 drivers · 2 owner-operators, 6 hired by owners, 2 team pairs') + ' · one person, one record: an owner-operator is one driver and one owner, never two people', ph:'Name, ID, phone, email or truck',
      kpis: team ? L.kpis : [
        {label:'Dispatchable', value:'40', suffix:' of 44', sub:'3 blocked by documents · 1 inactive', k:'ok', sk:'mu'},
        {label:'On a load', value:'31', suffix:'', sub:'9 available · 4 off duty', k:'brand', sk:'mu'},
        {label:'Teams', value:'2', suffix:' pairs', sub:'Johnsons on T-1171 · Ito and Walsh on T-1180', k:'violet', sk:'mu'},
        {label:'Tied to an owner', value:'8', suffix:'', sub:'2 owner-operators · 6 hired by owners', k:'teal', sk:'mu'},
        {label:'Expiring · 30 days', value:'6', suffix:'', sub:'3 medical cards · 2 MVRs · 1 CDL', k:'warn', sk:'warn'}], kpiN: team ? 4 : 5,
      adds:['Works as','Qualification','Endorsement','Channel'], fz:'fz2'});
    tabbed(L, X, [['All','44',() => true],['Available','9',r => r.st === 'Available'],['On a load','31',r => /On load|At pickup|Starts/.test(r.st)],['Teams',undefined,r => r.team],['Owner-operators',undefined,r => r.op],['Hired by owners',undefined,r => !!HIRED_BY[r.key]],['Not dispatchable','3',r => r.qk === 'bad'],['Inactive','1',r => r.st === 'Inactive']], rows);
    // pay type column: what kind of statement they get
    L.rows.forEach(r => { const i = 18; if (r.cells[i]) r.cells[i] = T.tx(OP_DRIVERS[r.key] ? 'Owner settlement' : (r.key === 'Jerome Banks' ? 'Set by Alex · outside FlyFleet' : (TEAM_OF[r.key] ? 'Team · ' + (r.key === 'Darius Johnson' || r.key === 'Nia Johnson' ? '$0.72 a team mile · 50/50' : '$0.70 a mile each drove') : (SETTLE5[r.key] ? SETTLE5[r.key][2] : 'Per mile · $0.60'))), '', 't2'); });
    L.foot = 'Showing ' + L.rows.length + ' of ' + (L.tabs.find(t => t.on) || {}).n + ' · scroll sideways for more columns';
    sortable(L, X, ['name','emp','st',null,null,null,null,null,'q'], {k:'name', dir:1});
    return selectable(L, X, ['Message','Request documents','Invite to app','Export']);
  }

  if (screen === 'customers') {
    const rows = CUSTOMERS.map(([n, code, st, k, ct, terms, loads, bal, ot]) => ({key:n, cls: st === 'Archived' ? 'dim' : '', open:noop, q:[n, code, ct].join(' ').toLowerCase(), st, sk:{n, loads:+loads, bal, ot:parseInt(ot, 10) || 0},
      cells:[T.tx(n, '', 'w5'), T.tx(code, '', 'mono fs12 t2'), T.b(st, k), mu(ct === '—' ? '' : ct), T.tx(ct === '—' ? '—' : 'Operations', '', ct === '—' ? 'mu' : 't2'), T.tx(ct === '—' ? '—' : CUST_PH[n], '', ct === '—' ? 'mu' : 'mono fs12'), T.tx(terms, '', 't2'), T.n(loads)]
        .concat(fin ? [T.m(fm(bal), '', bal ? '' : 'mu')] : []).concat([T.n(ot), T.more()])}));
    Object.assign(L, {cols:'220px 96px 124px 150px 104px 128px 80px 96px' + (fin ? ' 120px' : '') + ' 80px 28px',
      head:[H('Customer'),H('Code'),H('Status'),H('Primary contact'),H('Role'),H('Phone'),H('Terms'),H('Loads · 30 d',1)].concat(fin ? [H('Open balance',1)] : []).concat([H('On time',1),H('')]), fz:'fz1'});
    tabbed(L, X, [['Active','7',r => r.st === 'Active'],['Credit review','1',r => r.st === 'Credit review'],['Archived','1',r => r.st === 'Archived'],['All','9',() => true]], rows);
    sortable(L, X, ['n',null,null,null,null,null,null,'loads'].concat(fin ? ['bal','ot'] : ['ot']), {k:'n', dir:1});
    L.foot = 'Showing ' + L.rows.length + ' of ' + (L.tabs.find(t => t.on) || {}).n;
    return L;
  }

  if (screen === 'owners') {
    const outside = OWN5.filter(o => o.cat !== 'carrier');
    const rows = OWN5.map(o => { const car = o.cat === 'carrier', us = unitsOf(o.id), tr = car ? o.trucks : us.filter(x => x.kind === 'truck').length, tl = car ? o.trailers : us.filter(x => x.kind === 'trailer').length;
      const drivers = car ? '—' : String(us.filter(x => x.driver && x.since !== 'Pending').reduce((a, x) => a + (x.co ? 2 : 1), 0));
      const active = car ? '22' : String(us.filter(x => x.load).length), w = car ? null : ownerWeek(o.id);
      return {key:o.id, cls: o.status === 'Ended' ? 'dim' : '', open: car ? () => c.go('trucks') : () => c.owner(o.id), q:[o.name, o.contact, o.email, o.ph, o.city, o.dba].join(' ').toLowerCase(), cat:o.cat, ent:o.entity, st:o.status,
        sk:{n: car ? '' : o.name, tr:-tr, act:-(+active || 0)},
        cells:[T.p(o.name, car ? 'LS' : (o.entity === 'business' ? o.name.split(' ').slice(0, 2).map(w2 => w2[0]).join('') : o.first[0] + o.last[0]), '', ''), T.tx(o.entity === 'business' ? 'Business' : 'Individual', '', 't2'),
          car ? T.tx('Company fleet', '', 'mu') : T.tags([{v:CAT5[o.cat], k: o.cat === 'op' ? 'brand' : 'teal'}]), mu(o.dba), car ? mu('') : (o.entity === 'business' ? T.tx(o.contact, o.ctitle, '', 't3') : T.tx('Self', '', 'mu')),
          car ? mu('') : T.tx(o.ph, '', 'mono fs12'), car ? mu('') : T.tx(o.email, '', 'fs12 t2'), T.tx(o.city, '', 't2'), T.tx(o.state, '', 'mono fs12 t2'),
          T.n(String(tr)), T.n(tl ? String(tl) : '—'), T.n(drivers), T.n(active), car ? mu('') : T.tx(o.drives, '', 't2'), car ? T.tx('Owned outright', '', 't2') : T.tx([...new Set(us.map(x => TERMS[x.terms] ? TERMS[x.terms].l : ''))].filter(Boolean).join(' + ') || '—', '', 't2'),
          car ? mu('') : T.tags([{v:o.portal, k:o.pk}])]
          .concat(fin ? [car || !w || !w.net ? {...mu(o.status === 'Ended' ? 'Final accounting due Nov 14' : ''), al:'rt'} : T.m(fm2(w.net))] : [])
          .concat([T.b(car ? 'Carrier' : o.status, car ? 'mu' : o.sk), car ? acts([['View', () => c.go('trucks')]]) : acts([['View', () => c.owner(o.id)], ['Edit', () => c.ownerForm('edit', o.id)]])])}; });
    Object.assign(L, {group:'Directory', title:'Owners', sub:'Individuals and businesses that own trucks and trailers working for Lone Star. Owning equipment is separate from driving it and from working here.', ph:'Name, contact, email, phone or city',
      actions:[A('Owner portal settings','', I.lock, () => c.go('team')), A('Add owner','pri', I.plus, () => c.ownerForm('new'))],
      kpis:[
        {label:'Total owners', value:String(outside.length), suffix:'', sub:'5 individuals · 3 businesses', k:'brand', sk:'mu'},
        {label:'Active owners', value:String(outside.filter(o => o.status === 'Active').length), suffix:'', sub:'1 onboarding · 1 ended', k:'ok', sk:'mu'},
        {label:'Owned trucks', value:'13', suffix:' of 41', sub:'Plus 4 trailers · 1 truck onboarding', k:'teal', sk:'mu'},
        {label:'Owner-operators', value:String(outside.filter(o => o.cat === 'op').length), suffix:'', sub:'Drive at least one of their trucks', k:'info', sk:'mu'},
        {label:'Non-operating owners', value:String(outside.filter(o => o.cat === 'nonop').length), suffix:'', sub:'Their trucks run with other drivers', k:'violet', sk:'mu'}], kpiN:5,
      adds:['Category','Entity','Agreement','Portal'], fz:'fz2',
      cols:'220px 96px 168px 132px 160px 120px 240px 100px 56px 64px 72px 72px 80px 280px 260px 150px' + (fin ? ' 120px' : '') + ' 108px 132px',
      head:[H('Owner'),H('Entity'),H('Category'),H('DBA'),H('Contact'),H('Phone'),H('Email'),H('City'),H('State'),H('Trucks',1),H('Trailers',1),H('Drivers',1),H('Active loads',1),H('Who drives'),H('Agreements'),H('Portal')].concat(fin ? [H('This week’s net',1)] : []).concat([H('Status'),H('')])});
    tabbed(L, X, [['All',undefined,() => true],['Owner-operators',undefined,r => r.cat === 'op'],['Non-operating',undefined,r => r.cat === 'nonop'],['Individuals',undefined,r => r.ent === 'individual' && r.cat !== 'carrier'],['Businesses',undefined,r => r.ent === 'business' && r.cat !== 'carrier'],['Onboarding',undefined,r => r.st === 'Onboarding'],['Ended',undefined,r => r.st === 'Ended']], rows);
    L.foot = 'Showing ' + L.rows.length + ' of ' + (L.tabs.find(t => t.on) || {}).n + ' · scroll sideways for more columns';
    sortable(L, X, ['n',null,null,null,null,null,null,null,null,'tr',null,null,'act'], {k:'n', dir:1});
    return selectable(L, X, ['Send statements','Invite to portal','Export']);
  }

  if (screen === 'settlements') return buildStatements5(L, X);
  return L;
};


// ---------------------------------------------------------------- small chart builders (stacked columns, multi-line, ranked bars)
const VK = ['v1','v2','v3','v4','v5','v6'];
const niceMax = v => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; };
const kfmt = v => v >= 1000 ? '$' + (v / 1000).toFixed(v >= 100000 ? 0 : 1) + 'k' : '$' + Math.round(v);
function colStack(series, labels, fmt) {
  const tot = labels.map((l, i) => series.reduce((a, s) => a + (s.vals[i] || 0), 0));
  const mx = niceMax(Math.max(...tot) * 1.08), f = fmt || kfmt;
  return {ticks:[mx, mx * 0.75, mx * 0.5, mx * 0.25, 0].map(f), legend:series.map((s, i) => ({n:s.n, k:s.k || VK[i]})),
    cols:labels.map((l, i) => ({l, tot:f(tot[i]), b:(tot[i] / mx * 100).toFixed(2) + '%', title:l + ': ' + series.map(s => s.n + ' ' + f(s.vals[i] || 0)).join(' · '),
      segs:series.map((s, j) => ({k:s.k || VK[j], h:(tot[i] ? (s.vals[i] || 0) / tot[i] * 100 : 0).toFixed(2) + '%', on: (s.vals[i] || 0) > 0})).filter(sg => sg.on)}))};
}
function multiLine(series, labels, fmt) {
  const all = series.flatMap(s => s.vals), mx = niceMax(Math.max(...all) * 1.08), n = labels.length, f = fmt || kfmt;
  const xf = i => (i + 0.5) / n, yf = v => 1 - v / mx;
  return {vb:'0 0 800 200', ticks:[mx, mx * 0.75, mx * 0.5, mx * 0.25, 0].map(f), w:(100 / n).toFixed(3) + '%', legend:series.map((s, i) => ({n:s.n, k:s.k || VK[i]})),
    paths:series.map((s, i) => ({k:s.k || VK[i], d:s.vals.map((v, j) => (j ? 'L' : 'M') + (xf(j) * 800).toFixed(1) + ',' + (yf(v) * 200).toFixed(1)).join(' ')})),
    pts:labels.map((l, j) => ({l, x:(xf(j) * 100).toFixed(3) + '%', dots:series.map((s, i) => ({k:s.k || VK[i], y:(yf(s.vals[j]) * 100).toFixed(2) + '%'})),
      tip:series.map((s, i) => ({k:s.k || VK[i], n:s.n, v:f(s.vals[j])})), aria:l + ': ' + series.map(s => s.n + ' ' + f(s.vals[j])).join(', ')})),
    ends:series.map((s, i) => ({k:s.k || VK[i], v:f(s.vals[n - 1]), y:(yf(s.vals[n - 1]) * 100).toFixed(2) + '%'}))};
}
const hbars = (items, fmt) => { const mx = Math.max(1, ...items.map(x => Math.abs(x.v))); return items.map((x, i) => ({n:x.n, v:(fmt || kfmt)(x.v), s:x.s || '', k:x.k || VK[i % 6], w:(Math.abs(x.v) / mx * 74).toFixed(2) + '%', neg: x.v < 0 ? 'neg' : ''})); };

// ---------------------------------------------------------------- driver pay statements (company drivers, team drivers, and drivers Lone Star pays for an owner)
// [driver, initials, pay basis, truck, loads, miles, gross, deductions, reimbursements, status, tone, kind, for owner]
const SETTLE5_ROWS = [
  ['Ana Ruiz','AR','Per mile · $0.62','T-1108',6,'2,210',1370.20,-185.00,75.00,'In review','info','company',''],
  ['Marcus Bell','MB','Per mile · $0.62','T-1142',7,'2,486',1541.32,-160.00,0,'In review','info','company',''],
  ['Jamal Carter','JC','Per mile · $0.64','T-1121',5,'1,904',1218.56,-120.00,45.00,'Approved','ok','company',''],
  ['Priya Shah','PS','Per mile · $0.60','T-1155',6,'2,035',1221.00,-95.00,0,'Draft','draft','company',''],
  ['Ben Okafor','BO','Per mile · $0.62','T-1117',5,'2,312',1433.44,-140.00,60.00,'Draft','draft','company',''],
  ['Kara Nguyen','KN','Per mile · $0.58','T-1160',4,'1,620',939.60,-85.00,0,'Draft','draft','company',''],
  ['Sam Whitfield','SW','Per mile · $0.62','T-1102',6,'1,488',922.56,-110.00,30.00,'Paid','completed','company',''],
  ['Devon Price','DP','Per mile · $0.58','T-1149',4,'1,702',987.16,-90.00,0,'Draft','draft','company',''],
  ['Hannah Scott','HS','Per mile · $0.61','T-1190',3,'2,288',1395.68,-100.00,0,'Draft','draft','company',''],
  ['Darius Johnson','DJ','Team · $0.72 a team mile · 50/50','T-1171',2,'5,840 team',2102.40,-120.00,0,'In review','info','team',''],
  ['Nia Johnson','NJ','Team · $0.72 a team mile · 50/50','T-1171',2,'5,840 team',2102.40,-120.00,0,'In review','info','team',''],
  ['Rafael Gomez','RG','Per mile · $0.60','T-1168',4,'2,310',1386.00,0,0,'In review','info','owner','CT'],
  ['Dwayne Hill','DH','Per mile · $0.60','T-1174',3,'2,105',1263.00,0,0,'In review','info','owner','CT'],
  ['Paul Mendez','PM','Per mile · $0.60','T-1177',3,'1,880',1128.00,0,0,'In review','info','owner','CT'],
  ['Ken Ito','KI','Team · $0.70 a mile he drove','T-1180',3,'2,610',1827.00,0,0,'In review','info','team-owner','CT'],
  ['Katie Walsh','KW','Team · $0.70 a mile she drove','T-1180',3,'2,350',1645.00,0,0,'In review','info','team-owner','CT'],
];
const SETTLE5 = {}; SETTLE5_ROWS.forEach(r => { SETTLE5[r[0]] = r; });
function buildStatements5(L, X) {
  const {c, ltab, roleKey} = X;
  const A = (l, cls, ic, go) => ({l, cls:cls||'', ic:ic||'', go:go||noop});
  const owners = OWN5.filter(o => o.cat !== 'carrier' && o.status !== 'Onboarding');
  const drvGross = SETTLE5_ROWS.filter(r => r[11] === 'company' || r[11] === 'team').reduce((a, r) => a + r[6], 0);
  const runGross = SETTLE5_ROWS.filter(r => r[12]).reduce((a, r) => a + r[6], 0);
  const ownNet = owners.filter(o => o.status === 'Active').reduce((a, o) => a + ownerWeek(o.id).net, 0);
  const escHeld = Object.entries(ESCROW).filter(([k]) => k !== 'KL').reduce((a, [, v]) => a + v[0], 0);
  const ti = Math.min(ltab || 0, 1);
  Object.assign(L, {group:'Finance', title:'Statements', sub:'Week of Nov 2–8 · pays Nov 14 · one statement per payee per week', ph:'Name, truck or owner',
    actions:[A('Export pay file','', I.download), A('Run statements','pri', I.play)],
    tabs:[['Driver pay', String(SETTLE5_ROWS.length)], ['Owner settlements', String(owners.length)]].map(([l, n], i) => ({l, n, on: i === ti ? 'on' : '', go:() => c.ltab(i)})),
    kpis:[
      {label:'Company and team driver pay', value:fm2(drvGross), suffix:'', sub:'11 drivers · paid by Lone Star', k:'brand', sk:'mu'},
      {label:'Driver pay run for owners', value:fm2(runGross), suffix:'', sub:'Castillo’s 5 drivers · charged to Castillo', k:'v4', sk:'mu'},
      {label:'Owner settlements · net', value:fm2(ownNet), suffix:'', sub:'6 active owners · 13 trucks · 4 trailers', k:'teal', sk:'mu'},
      {label:'Escrow held for owners', value:'$' + n0f(escHeld), suffix:'', sub:'Kowalski refund of $5,000 due Nov 14', k:'warn', sk:'warn'}], kpiN:4,
    callout:{k:'info', ic:I.info, t:'Every dollar has one home', d:'Customers pay load revenue. Lone Star keeps its share under each truck’s agreement and pays its company drivers from it. Owners get their share minus their own costs, on one owner settlement a week. Owner-operators are paid only there, never on a driver statement too, and team drivers each get their own statement.', b:''},
    adds:['Status','Pay type','Truck owner'], fz:'fz1', hidden:''});
  if (ti === 0) {
    const kindL = {company:'Company driver', team:'Company · team', owner:'Owner’s driver', 'team-owner':'Owner’s team'};
    const rows = SETTLE5_ROWS.map(([n, ini, basis, unit, loads, mi, gross, ded, reimb, st, k, kind, forO]) => {
      const o = ownerOfUnit(unit), net = gross + ded + reimb, act = st === 'In review' ? 'Approve' : (st === 'Draft' ? 'Review' : 'View');
      return {key:n, open:noop, q:[n, unit, basis, o.name].join(' ').toLowerCase(), sk:{n:n.split(' ').reverse().join(' '), net},
        cells:[T.p(n, ini, '', ''), T.tags([{v:kindL[kind], k: kind.indexOf('team') >= 0 ? 'violet' : (kind === 'owner' ? 'teal' : 'mu')}]), T.tx(forO ? own5(forO).name : 'Lone Star Freight', '', forO ? '' : 't2'),
          TEAM_OF[n] ? T.tx(TEAM_OF[n]) : mu(''), lk(unit, () => c.truck(unit)), o.cat === 'carrier' ? T.tx('Company fleet', '', 'mu') : nk(o.name, () => c.owner(o.id)),
          T.n(String(loads)), mi.indexOf('team') > 0 ? T.n(mi.replace(' team', ''), 'team miles') : T.n(mi), T.tx(basis, kind.indexOf('team') === 0 && basis.indexOf('50/50') > 0 ? '5,840 mi × $0.72 ÷ 2' : '', 't2', 't3'), T.m(fm2(gross)), T.m(ded ? fm2(ded) : '—', '', ded ? 't3' : 'mu'), T.m(reimb ? '+' + fm2(reimb) : '—', '', reimb ? '' : 'mu'), T.m(fm2(net), '', 'w6'),
          T.tx(forO ? 'Lone Star · charged to ' + own5(forO).name.split(' ')[0] : 'Lone Star', '', 't2'), T.b(st, k), T.btn(act, noop, act === 'Approve' && (roleKey === 'owner' || roleKey === 'accounting') ? 'pri' : '')]}; });
    Object.assign(L, {cols:'200px 140px 176px 136px 80px 168px 64px 104px 236px 104px 104px 120px 112px 228px 112px 92px',
      head:[H('Driver'),H('Pay type'),H('Works for'),H('Team partner'),H('Truck'),H('Truck owner'),H('Loads',1),H('Miles',1),H('Pay basis'),H('Gross pay',1),H('Deductions',1),H('Reimbursed',1),H('Net pay',1),H('Paid by'),H('Status'),H('')], rows,
      foot:'16 driver pay statements · Tom Reyes and Luis Ortega drive too, and are paid on their owner settlements'});
  } else {
    const rows = owners.map(o => { const w = ownerWeek(o.id), us = unitsOf(o.id), tr = us.filter(x => x.kind === 'truck').length, tl = us.length - tr;
      const fuel = w.per.reduce((a, r) => a + (TERMS[r.x.terms].fuelBy === 'owner' ? r.x.fuel || 0 : 0), 0), other = -w.ded - fuel - w.drvPayRun;
      const st = o.status === 'Ended' ? ['Final accounting','warn'] : (o.id === 'PC' ? ['Approved','ok'] : (o.id === 'LO' ? ['Approved','ok'] : ['In review','info']));
      return {key:o.id, open:() => c.stmt(o.id), q:[o.name, o.dba].join(' ').toLowerCase(), sk:{n:o.name, net:w.net},
        cells:[T.p(o.name, o.entity === 'business' ? o.name.split(' ').slice(0, 2).map(x => x[0]).join('') : o.first[0] + o.last[0], '', ''), T.tx(o.entity === 'business' ? 'Business' : 'Individual', '', 't2'), T.tags([{v:CAT5[o.cat], k:o.cat === 'op' ? 'brand' : 'teal'}]),
          T.n(String(tr)), T.n(tl ? String(tl) : '—'), T.n(String(w.per.reduce((a, r) => a + (r.x.loads || 0), 0))), T.m(w.rev ? fm2(w.rev) : '—'), T.m(w.carrier ? fm2(w.carrier) : '—', '', 't3'), T.m(fm2(w.gross)),
          T.m(fuel ? fm2(-fuel) : '—', '', fuel ? 't3' : 'mu'), T.m(w.drvPayRun ? fm2(-w.drvPayRun) : '—', '', w.drvPayRun ? 't3' : 'mu'), T.m(other > 0.004 ? fm2(-other) : '—', '', other > 0.004 ? 't3' : 'mu'), o.id === 'KL' ? T.m('+$5,000.00', 'Escrow refund', 'w6') : T.m(fm2(w.net), '', 'w6'),
          T.m((ESCROW[o.id] || [0])[0] ? '$' + n0f(ESCROW[o.id][0]) : '—', '', 't2'), T.b(st[0], st[1]), T.btn('Open', () => c.stmt(o.id), '')]}; });
    Object.assign(L, {cols:'220px 96px 168px 64px 72px 64px 120px 132px 116px 108px 128px 128px 128px 100px 132px 72px',
      head:[H('Owner'),H('Entity'),H('Category'),H('Trucks',1),H('Trailers',1),H('Loads',1),H('Load revenue',1),H('Lone Star’s share',1),H('Owner gross',1),H('Fuel',1),H('Driver pay run',1),H('Other deductions',1),H('Net settlement',1),H('Escrow',1),H('Status'),H('')], rows,
      foot:'7 owner settlements, including Kowalski’s final accounting · load revenue and Lone Star’s share are shown for the split; only the net is paid'});
  }
  const q = String(X.lq || '').trim().toLowerCase();
  if (q) L.rows = L.rows.filter(r => (r.q || '').indexOf(q) >= 0);
  L.setQ = e => c.lq(e && e.target ? e.target.value : ''); L.qv = X.lq || '';
  sortable(L, X, ti === 0 ? ['n',null,null,null,null,null,null,null,null,null,null,null,'net'] : ['n',null,null,null,null,null,null,null,null,null,null,null,'net'], {k:'n', dir:1});
  return L;
}

// ---------------------------------------------------------------- loads, fuel, expenses, maintenance and documents on an owner's equipment
// lanes with real distances; each unit's week is rebuilt from its miles so the tables add up to the statement
const LANES5 = [['Houston','TX','Beaumont','TX',85],['San Antonio','TX','Laredo','TX',157],['Temple','TX','Tyler','TX',158],['Waco','TX','San Antonio','TX',181],['Dallas','TX','Shreveport','LA',188],
  ['Fort Worth','TX','Oklahoma City','OK',204],['Lewisville','TX','Austin','TX',214],['Dallas','TX','Houston','TX',239],['Houston','TX','Dallas','TX',239],['Irving','TX','Little Rock','AR',326],
  ['Garland','TX','Lubbock','TX',332],['Houston','TX','New Orleans','LA',348],['Fort Worth','TX','Amarillo','TX',357],['Laredo','TX','Dallas','TX',432],['Dallas','TX','Memphis','TN',452],
  ['Dallas','TX','Kansas City','MO',506],['Dallas','TX','Atlanta','GA',781],['Dallas','TX','Denver','CO',790],['Laredo','TX','Memphis','TN',868],['Houston','TX','Chicago','IL',1085],['Laredo','TX','Chicago','IL',1330]];
const CUST5 = ['Walmart Transportation','Home Depot Supply','Sysco North Texas','PepsiCo Logistics','Georgia-Pacific','Owens Corning','ABC Supply'];
const r2 = v => Math.round(v * 100) / 100;
const unitD = u => parseInt(String(u).replace(/\D/g, ''), 10) || 0;
function weekLoads(x) {
  if (x.kind !== 'truck' || !x.loads) return [];
  const d = unitD(x.u), n = x.loads, tgt = x.mi * 0.86 / n, used = new Set(), out = [];
  for (let i = 0; i < n; i++) {
    const t = tgt * (1 + (i - (n - 1) / 2) * 0.22);
    let best = null; LANES5.forEach((ln, j) => { if (used.has(j)) return; if (!best || Math.abs(ln[4] - t) < Math.abs(best[1][4] - t)) best = [j, ln]; });
    used.add(best[0]); out.push(best[1]);
  }
  const lm = out.reduce((a, l) => a + l[4], 0);
  let lhLeft = x.lh, fscLeft = x.fsc;
  return out.map((ln, i) => { const last = i === n - 1, lh = last ? r2(lhLeft) : r2(x.lh * ln[4] / lm), fsc = last ? r2(fscLeft) : r2(x.fsc * ln[4] / lm); lhLeft -= lh; fscLeft -= fsc;
    const acc = i === 0 ? x.acc || 0 : 0, day = 2 + Math.floor(i * 6 / n), dur = ln[4] > 600 ? 2 : (ln[4] > 300 ? 1 : 0);
    return {id:'FF-2' + (3000 + (d % 100) * 9 + i), u:x.u, drv:x.co ? x.driver + ' & ' + x.co.split(' ')[0] : x.driver, cust:CUST5[(d + i) % CUST5.length], o:ln[0] + ', ' + ln[1], dst:ln[2] + ', ' + ln[3],
      pu:'Nov ' + day, del:'Nov ' + Math.min(8, day + dur), mi:ln[4], lh, fsc, acc, rev:r2(lh + fsc + acc), st:'Delivered', sk:'ok', late: (d + i * 3) % 11 === 0}; });
}
const LIVE5 = {'FF-24833':['Garland, TX','Lubbock, TX','Nov 12','Nov 13',332,'Owens Corning'], 'FF-24866':['Waco, TX','Dallas, TX','Nov 13','Nov 13',97,'Sysco North Texas'], 'FF-24828':['Irving, TX','Little Rock, AR','Nov 13','Nov 14',326,'Home Depot Supply'],
  'FF-24817':['Fort Worth, TX','Oklahoma City, OK','Nov 13','Nov 13',204,'Walmart Transportation'], 'FF-24839':['Lewisville, TX','Austin, TX','Nov 13','Nov 13',214,'PepsiCo Logistics'], 'FF-24801':['Dallas, TX','Houston, TX','Nov 13','Nov 13',239,'Home Depot Supply'],
  'FF-24852':['Houston, TX','Dallas, TX','Nov 13','Nov 13',239,'Sysco North Texas'], 'FF-24879':['Irving, TX','Little Rock, AR','Nov 14','Nov 14',326,'Georgia-Pacific'], 'FF-24861':['Waco, TX','San Antonio, TX','Nov 13','Nov 13',181,'PepsiCo Logistics'],
  'FF-24864':['Fort Worth, TX','Amarillo, TX','Nov 13','Nov 14',357,'Walmart Transportation'], 'FF-24858':['Dallas, TX','Shreveport, LA','Nov 13','Nov 13',188,'ABC Supply'], 'FF-24849':['Laredo, TX','Memphis, TN','Nov 12','Nov 14',868,'Walmart Transportation']};
function ownerLoads(id) {
  const us = unitsOf(id).filter(x => x.kind === 'truck' && x.since !== 'Pending'), out = [];
  us.forEach(x => { const ld = LOADS.find(z => z.id === x.load), dt = t => String(t || '').split(' · ')[0];
    if (ld) { const fsc = r2(ld.mi * 0.42); out.push({id:ld.id, u:x.u, drv:x.co ? x.driver + ' & ' + x.co.split(' ')[0] : x.driver, cust:ld.cust, o:ld.pu, dst:ld.del, pu:dt(ld.puT), del:dt(ld.delT), mi:ld.mi, lh:ld.rate, fsc, acc:0, rev:r2(ld.rate + fsc), st:x.status, sk:x.sk, active:1}); return; }
    const lv = LIVE5[x.load]; if (lv) { const rpm = x.mi ? x.lh / x.mi : 2.4, lh = r2(lv[4] * rpm * 1.05), fsc = r2(lv[4] * 0.42);
      out.push({id:x.load, u:x.u, drv:x.co ? x.driver + ' & ' + x.co.split(' ')[0] : x.driver, cust:lv[5], o:lv[0], dst:lv[1], pu:lv[2], del:lv[3], mi:lv[4], lh, fsc, acc:0, rev:r2(lh + fsc), st:x.status, sk:x.sk, active:1}); } });
  us.forEach(x => weekLoads(x).forEach(l => out.push(l)));
  if (id === 'CT') out.push({id:'FF-24790', u:'T-1177', drv:'Paul Mendez', cust:'Georgia-Pacific', o:'Laredo, TX', dst:'Dallas, TX', pu:'Nov 6', del:'—', mi:0, lh:150, fsc:0, acc:0, rev:150, st:'Cancelled', sk:'mu', tonu:1});
  if (id === 'JH') out.push({id:'FF-24797', u:'T-1121', drv:'Jamal Carter', cust:'Owens Corning', o:'Temple, TX', dst:'Tyler, TX', pu:'Nov 4', del:'—', mi:0, lh:150, fsc:0, acc:0, rev:150, st:'Cancelled', sk:'mu', tonu:1});
  return out;
}
const STOPS5 = [['Love’s #312','Waco','TX'],['Pilot #446','Hillsboro','TX'],['TA #219','Ennis','TX'],['Love’s #587','Buffalo','TX'],['Pilot #1093','Laredo','TX'],['Flying J #702','Denton','TX'],['Love’s #258','Ardmore','OK'],['Petro #351','Texarkana','AR']];
const PPG5 = [3.79, 3.84, 3.91, 3.86, 3.95, 3.82];
function fuelTx(x) {
  if (!x.fuel) return [];
  const d = unitD(x.u), n = Math.max(1, Math.round(x.fuel / 430)), out = []; let left = x.fuel;
  for (let i = 0; i < n; i++) { const amt = i === n - 1 ? r2(left) : r2(x.fuel / n), ppg = PPG5[(d + i) % PPG5.length], st = STOPS5[(d + i * 3) % STOPS5.length]; left -= amt;
    out.push({date:'Nov ' + (2 + Math.floor(i * 6 / n)), u:x.u, drv:x.driver, stop:st[0], city:st[1], state:st[2], gal:(amt / ppg).toFixed(1), ppg:'$' + ppg.toFixed(3), amt, card:'WEX ••' + String(4000 + d % 1000).slice(-4), by:TERMS[x.terms].fuelBy}); }
  return out;
}
// [work order, unit, date, what, shop, status, tone, cost, who pays]
const MAINT5 = [
  ['WO-1179','T-1174','Nov 5','Brake chambers, both drive axles','Rush Truck Center · Irving','Done','ok',486.50,'owner'],
  ['WO-1162','T-1168','Oct 22','PM-A service, oil and filters','Lone Star shop · Dallas','Done','ok',612.40,'owner'],
  ['WO-1191','T-1180','Dec 9','DOT annual inspection','Lone Star shop · Dallas','Scheduled','info',0,'owner'],
  ['WO-1150','T-1177','Oct 9','Steer tires, alignment','Love’s Truck Care · Waco','Done','ok',1388.00,'owner'],
  ['WO-1186','T-1142','Nov 7','Drive tires, 8 positions','Lone Star shop · Dallas','Done','ok',1214.80,'owner'],
  ['WO-1173','T-1121','Dec 1','DOT annual inspection','Lone Star shop · Dallas','Scheduled','info',0,'owner'],
  ['WO-1158','T-1108','Oct 18','PM-A service','Lone Star shop · Dallas','Done','ok',598.20,'owner'],
  ['WO-1167','T-1129','Oct 30','PM-A service, DEF sensor','Peterbilt of Dallas','Done','ok',742.15,'owner'],
  ['WO-1192','T-1102','Nov 20','PM-B service','Lone Star shop · Dallas','Scheduled','info',0,'owner'],
  ['WO-1140','T-1133','Oct 2','PM-A service','Lone Star shop · Dallas','Done','ok',398.00,'owner'],
  ['WO-1188','TR-5302','Nov 11','Reefer unit PM, belts','Carrier Transicold · Houston','In the shop','warn',864.00,'carrier'],
  ['WO-1171','T-1149','Nov 3','Return-to-service check after DPF clean','Lone Star shop · Dallas','Done','ok',1120.00,'carrier'],
  ['WO-1183','T-1186','Nov 6','PM-B service','Rush Truck Center · Irving','Done','ok',905.60,'owner'],
];
function docsOf(o) {
  const us = unitsOf(o.id), out = [];
  const add = (t, ty, u, up, exp, st, k, portal) => out.push({t, ty, u, up, exp, st, k, portal});
  if (o.status === 'Onboarding') add('Owner-operator lease', 'Agreement', 'All units', 'Nov 12', '—', 'Waiting on e-signature', 'warn', 1);
  else if (o.status === 'Ended') add('Lease termination letter', 'Agreement', 'All units', 'Sep 30', '—', 'On file', 'ok', 1);
  else add(o.cat === 'op' ? 'Owner-operator lease' : (us.some(x => x.terms === 'rent') ? 'Equipment rental agreement' : 'Equipment lease'), 'Agreement', 'All units', o.since, o.cat === 'op' ? 'Renews yearly' : '—', 'Signed', 'ok', 1);
  add(o.entity === 'business' ? 'W-9 · ' + o.tax.replace(' ending', ' ••') : 'W-9 · ' + o.tax.replace(' ending', ' ••'), 'Tax', '—', o.since === '—' ? 'Nov 12' : o.since, '—', 'On file', 'ok', 0);
  add('Certificate of insurance', 'Insurance', 'All units', 'Jul 1', o.id === 'AR' ? 'Nov 30' : 'Jun 30, 2027', o.id === 'AR' ? 'Expires in 17 days' : 'Valid', o.id === 'AR' ? 'warn' : 'ok', 1);
  us.forEach(x => { add('Title · ' + x.u, 'Ownership', x.u, x.since === 'Pending' ? 'Nov 12' : x.since, '—', x.since === 'Pending' ? 'In review' : 'On file', x.since === 'Pending' ? 'info' : 'ok', 1);
    add('Registration cab card · ' + x.u, 'Registration', x.u, 'Jan 2', x.exp, 'Valid', 'ok', 1);
    if (x.kind === 'truck') add('DOT annual inspection · ' + x.u, 'Inspection', x.u, 'Mar 14', 'Mar 14, 2027', 'Valid', 'ok', 1); });
  if (o.cat !== 'carrier' && o.status !== 'Onboarding') add('ACH authorization · ' + (o.entity === 'business' ? 'business account' : 'checking'), 'Payment', '—', o.since, '—', 'On file', 'ok', 0);
  if (ESCROW[o.id] && ESCROW[o.id][1]) add('Escrow statement · Q3 2026', 'Escrow', '—', 'Oct 1', '—', 'Sent', 'ok', 1);
  add('IRS 1099-NEC · 2025', 'Tax', '—', 'Jan 31', '—', o.since === '—' || o.since === 'Mar 2026' ? 'Not issued' : 'Issued', o.since === '—' ? 'mu' : 'ok', 1);
  return out;
}
const PORTAL5 = {
  TR:[['Tom Reyes','TR','Owner and driver','Admin · also signs in to the driver app with the same login','Signed in today 06:02','ok']],
  LO:[['Luis Ortega','LO','Owner and driver','Admin','Signed in yesterday 19:15','ok']],
  JH:[['James Holloway','JH','Owner','Admin','Signed in Nov 10','ok']],
  CT:[['Hector Castillo','HC','Principal','Admin · everything about Castillo equipment','Signed in today 07:12','ok'],['Elena Castillo','EC','Bookkeeper','Bookkeeper preset · statements, expenses, documents','Invited Nov 10 · not accepted yet','warn']],
  PC:[['Linda Tran','LT','Managing member','Admin','Signed in Nov 11','ok']],
  AR:[['Alex Rivera','AR','Owner','A separate owner login from his dispatcher account','Signed in yesterday 21:40','ok']],
  MB:[['Maya Brooks','MB','Owner and driver','Onboarding checklist until the lease is signed','Invited Nov 12','warn']],
  KL:[['Pete Kowalski','PK','President','Past statements and the final accounting','Access ends Dec 31','mu']],
};
// people tied to each owner: one record per person, with every role they hold
const PEOPLE5 = {
  TR:[['Tom Reyes','TR',['Owner','Driver','Portal admin'],'Owns T-1129 and T-1102 · drives T-1129 himself','One record. His CDL, medical card and hours sit on the driver side; he is paid only on his owner settlement, never on a driver statement.']],
  LO:[['Luis Ortega','LO',['Owner','Driver','Portal admin'],'Owns and drives T-1133','Owner-operator: one person, one record, one owner settlement a week.']],
  JH:[['James Holloway','JH',['Owner','Portal admin'],'Owns T-1108, T-1121 and T-1142 · doesn’t drive or work here','Lone Star’s company drivers run his trucks and are paid by Lone Star, never out of his settlement.']],
  CT:[['Castillo Transport LLC','CT',['Owner · business'],'4 trucks · EIN ending 4417','The owner on record is the business. People below act for it.'],['Hector Castillo','HC',['Principal','Portal admin'],'Signs the lease and approves settlement disputes',''],['Elena Castillo','EC',['Bookkeeper','Portal invited'],'Statements, expenses and documents only','']],
  PC:[['Pecan Creek Equipment LLC','PC',['Owner · business'],'2 trucks and 4 trailers · EIN ending 6150','Rents equipment to Lone Star; hires no drivers.'],['Linda Tran','LT',['Managing member','Portal admin'],'Watches miles, repairs and rental statements','']],
  AR:[['Alex Rivera','AR',['Owner','Employee · dispatcher','Portal user'],'Owns T-1186 · dispatches for Team A since 2022','One person with two roles. A second dispatcher must approve any load on his own truck, and his owner login is separate from his staff login.']],
  MB:[['Maya Brooks','MB',['Owner','Driver · onboarding'],'Will drive T-1195 herself','Her driver file and owner file are one person; dispatch is blocked until the lease and insurance are in.']],
  KL:[['Kowalski Leasing Inc.','KL',['Owner · business','Ended'],'Lease ended Sep 30 · 2 trucks returned','Read-only portal to Dec 31 for the final accounting.'],['Pete Kowalski','PK',['President'],'Gets the final accounting and escrow refund','']],
};
const ROLEK = r => /Driver/.test(r) ? 'brand' : (/Employee/.test(r) ? 'info' : (/Owner/.test(r) ? 'teal' : (/Ended/.test(r) ? 'mu' : (/invited/.test(r) ? 'warn' : 'violet'))));
const WHO5 = x => x.works === 'owner' ? ['The owner', 'Paid on the owner settlement'] : (x.works === 'company' ? ['Lone Star company driver', 'Paid by Lone Star on a driver statement'] : (x.payRun ? ['Hired by the owner', 'Lone Star runs the pay and charges the owner'] : ['Hired by the owner', 'Paid by the owner, outside FlyFleet']));


// the owner's units on the shared map, centred on them (labels flip left when two units sit close together)
function ownerMap(X, live) {
  const MP = buildMap({...X, team:null}), pts = live.filter(x => x.lat).map(x => ({x, p:GEO.P(x.lat, x.lon)}));
  const cx = pts.reduce((a, q) => a + q.p[0], 0) / Math.max(1, pts.length), cy = pts.reduce((a, q) => a + q.p[1], 0) / Math.max(1, pts.length);
  const seen = {};
  return {water:MP.water, states:MP.states, minor:MP.minor, major:MP.major, cities:MP.cities, shields:MP.shields, cx:String(Math.round(cx)), cy:String(Math.round(cy)),
    trucks:pts.map(({x, p}, i) => { const key = p.join(','), dup = seen[key] = (seen[key] || 0) + 1, px = p[0] + (dup - 1) * 30, py = p[1] + (dup - 1) * 22;
      const near = pts.some((q, j) => j !== i && Math.abs(q.p[0] - p[0]) < 70 && Math.abs(q.p[1] - p[1]) < 26 && q.p[0] > p[0]);
      return {unit:x.u, x:px, y:py, h: x.sk === 'transit' ? '35' : '0', k: x.kind === 'trailer' ? 'violet' : (x.sk === 'transit' || x.sk === 'assigned' ? 'brand' : (x.sk === 'hold' ? 'warn' : (x.sk === 'ok' ? 'ok' : 'off'))), cls:(x.fk === 'warn' ? 'stale' : '') + (near ? ' lft' : ''), aria:x.u + ', ' + x.loc + ', ' + x.fresh}; })};
}
// ---------------------------------------------------------------- owner profile: nine working tabs, a date range and a truck filter
const OTABS = [['ov','Overview'],['eq','Equipment'],['live','Live tracking'],['loads','Loads & dispatch'],['fuel','Fuel & expenses'],['stmt','Statements'],['mt','Maintenance'],['docs','Documents'],['acc','Access & permissions']];
const RANGES5 = [['wk','Nov 2–8'],['oct','October'],['six','Jun 1 – Nov 13']];
const rangeF = (x, r) => { if (r === 'wk') return 1; const s = unitD(x.u), from = sinceIdx(x.since), f = i => from < 0 || i < from ? 0 : MWK[i] * jit(s, i); return r === 'oct' ? f(4) : MON.reduce((a, m, i) => a + f(i), 0); };
const oIni = o => o.cat === 'carrier' ? 'LS' : (o.entity === 'business' ? o.name.split(' ').slice(0, 2).map(w => w[0]).join('') : o.first[0] + o.last[0]);
const unitTitle = x => x.year + ' ' + x.make + ' ' + x.model;
const LOC_K = k => k === 'ok' ? 'sk-ok' : (k === 'warn' ? 'sk-warn' : (k === 'bad' ? 'sk-bad' : 'sk-mu'));
function shareOf(x, l) { const t = TERMS[x.terms]; if (!t) return 0; if (x.terms === 'rent') return r2(l.mi * t.perMile); return r2(l.lh * t.pct + (t.fsc ? l.fsc : 0) + (t.acc ? l.acc : 0)); }
function buildOwner5(X) {
  const {c, fin, ownerId, roleKey, fv, otab, orange, otruck, oload} = X;
  const o = ownerId !== 'LSF' && own5(ownerId) ? own5(ownerId) : own5('CT');
  const approver = roleKey === 'owner' || roleKey === 'accounting';
  const tab = OTABS.some(t => t[0] === otab) ? otab : 'ov', range = RANGES5.some(r => r[0] === orange) ? orange : 'wk', rl = RANGES5.find(r => r[0] === range)[1];
  const all = unitsOf(o.id), live = all.filter(x => x.since !== 'Pending'), trucks = all.filter(x => x.kind === 'truck'), trailers = all.filter(x => x.kind === 'trailer');
  const pick = otruck && all.some(x => x.u === otruck) ? otruck : '', sel = pick ? live.filter(x => x.u === pick) : live;
  const isBiz = o.entity === 'business', short = isBiz ? o.name.replace(/ (LLC|Inc\.)$/, '') : o.first;
  const agg = sel.map(x => ({x, m:money(x), f:rangeF(x, range)})).filter(r => r.m);
  const S = k => r2(agg.reduce((a, r) => a + (r.m[k] || 0) * r.f, 0));
  const rev = S('rev'), carrier = S('carrier'), gross = S('gross'), ded = S('ded'), net = S('net'), fuelC = S('fuelCarrier');
  const drvC = r2(agg.filter(r => TERMS[r.x.terms].driverBy === 'carrier').reduce((a, r) => a + r.m.drvPay * r.f, 0));
  const drvRun = r2(agg.filter(r => r.x.payRun).reduce((a, r) => a + r.m.drvPay * r.f, 0));
  const trailerRent = r2(agg.filter(r => r.x.kind === 'trailer').reduce((a, r) => a + r.m.gross * r.f, 0));
  const miles = Math.round(agg.reduce((a, r) => a + (r.x.mi || 0) * r.f, 0)), nLoads = Math.round(agg.reduce((a, r) => a + (r.x.loads || 0) * r.f, 0));
  const loadsAll = ownerLoads(o.id).filter(l => !pick || l.u === pick), activeN = loadsAll.filter(l => l.active).length;
  const moving = trucks.filter(x => x.sk === 'transit' || x.sk === 'assigned').length;
  const docs = docsOf(o), perm = permOf(fv, o.id), permN = PERM_ALL.filter(k => perm[k]).length;
  const pct = rev ? Math.round(carrier / rev * 100) : 0;
  const R = {
    n:o.name, ini:oIni(o), ek: isBiz ? 'violet' : 'info', el: isBiz ? 'Business' : 'Individual', ck: o.cat === 'op' ? 'brand' : 'teal', cl:CAT5[o.cat], st:o.status, sk:o.sk,
    sub:[o.status === 'Onboarding' ? 'Onboarding since Nov 12' : (o.status === 'Ended' ? 'Owner Feb 2022 – Sep 2026' : 'Owner since ' + o.since), isBiz ? o.contact + ', ' + o.ctitle.toLowerCase() : (o.dba ? 'DBA ' + o.dba : ''), o.ph, fin ? o.tax : '', o.city + ', ' + o.state].filter(Boolean).join(' · '),
    edit:() => c.ownerForm('edit', o.id), canRun: approver && o.status === 'Active', openStmt:() => c.stmt(o.id), hasStmt: fin && o.status !== 'Onboarding',
    portalPreview:() => c.set({screen:'ownerportal', previewOwner:o.id, ptab:'ov', drawer:null, overlay:'none', modal:'none'}), hasPortal: o.status !== 'Onboarding',
    tabs:OTABS.map(([k, l]) => ({l, n: k === 'eq' ? String(all.length) : (k === 'loads' ? (activeN ? String(activeN) : '') : (k === 'docs' ? String(docs.length) : (k === 'acc' ? permN + '/12' : ''))), on: k === tab ? 'on' : '', go:() => c.set({otab:k})})),
    t:{ov: tab === 'ov', eq: tab === 'eq', live: tab === 'live', loads: tab === 'loads', fuel: tab === 'fuel', stmt: tab === 'stmt', mt: tab === 'mt', docs: tab === 'docs', acc: tab === 'acc'},
    ranges:RANGES5.map(([k, l]) => ({l, on: k === range ? 'on' : '', go:() => c.set({orange:k})})),
    units:[{l:'All units', on: pick ? '' : 'on', go:() => c.set({otruck:''})}].concat(all.map(x => ({l:x.u, on: x.u === pick ? 'on' : '', go:() => c.set({otruck:x.u})}))),
    filt: (pick ? pick : (trucks.length + (trucks.length === 1 ? ' truck' : ' trucks') + (trailers.length ? ' and ' + trailers.length + ' trailers' : ''))) + ' · ' + rl,
    fin, noFin: !fin,
  };
  // banner for the states that block work
  R.banner = o.status === 'Onboarding' ? {k:'info', t:'T-1195 can’t be dispatched yet', d:'Waiting on the signed lease (sent Nov 12), the certificate of insurance and Maya’s medical card. Her driver file and this owner file are the same person.', b:'Open checklist'}
    : (o.status === 'Ended' ? {k:'warn', t:'Final accounting due Nov 14', d:'Lease ended Sep 30. Escrow of $5,000 must be returned with a final accounting within 45 days of the end of the lease.', b:'Run final accounting'}
    : (o.id === 'AR' ? {k:'info', t:'Alex is also a Lone Star dispatcher', d:'Loads on T-1186 need a second dispatcher to approve them, and his owner login is separate from his staff login.', b:'View rule'} : null));
  // summary cards
  R.cards = fin ? [
    {label:'Equipment', value:String(trucks.length), suffix: trucks.length === 1 ? ' truck' : ' trucks', sub:(trailers.length ? trailers.length + ' trailers · ' : '') + moving + ' on loads now', k:'brand', sk:'mu'},
    {label:'Loads · ' + rl, value:n0f(nLoads), suffix:'', sub:n0f(miles) + ' mi · ' + activeN + ' active now', k:'info', sk:'mu'},
    {label:'Load revenue', value:fm(rev), suffix:'', sub:'What customers paid', k:'v1', sk:'mu'},
    {label:'Lone Star’s share', value:fm(carrier), suffix:'', sub: pct + '% of load revenue', k:'mu', sk:'mu'},
    {label:'Owner’s costs', value:fm(-ded || 0), suffix:'', sub: drvRun ? 'Includes ' + fm(drvRun) + ' driver pay' : 'Fuel, insurance, repairs', k:'warn', sk:'mu'},
    {label:'Net to owner', value:fm(net), suffix:'', sub: range === 'wk' ? 'Statement pays Nov 14' : 'Across ' + Math.round(agg.length ? rangeF(agg[0].x, range) : 0) + ' weekly statements', k:'ok', sk:'ok'}]
    : [
    {label:'Trucks', value:String(trucks.length), suffix:'', sub:moving + ' on loads now', k:'brand', sk:'mu'},
    {label:'Trailers', value:String(trailers.length), suffix:'', sub: trailers.length ? 'In Lone Star yards' : 'None owned', k:'violet', sk:'mu'},
    {label:'Active loads', value:String(activeN), suffix:'', sub:'Right now', k:'info', sk:'mu'},
    {label:'Loads · ' + rl, value:n0f(nLoads), suffix:'', sub:'Delivered', k:'ok', sk:'mu'},
    {label:'Miles · ' + rl, value:n0f(miles), suffix:' mi', sub:'All units', k:'teal', sk:'mu'},
    {label:'Next service', value: trucks.length ? trucks[0].u : '—', suffix:'', sub: trucks.length ? trucks[0].next : '', k:'warn', sk:'mu'}];
  // lifecycle: onboarding owners get a checklist, ended owners get the final accounting
  R.act5 = o.status === 'Active'; R.onb = o.status === 'Onboarding'; R.endc = o.status === 'Ended'; R.showMoney = fin && R.act5;
  const C6 = (label, value, suffix, sub, k, sk) => ({label, value, suffix, sub, k, sk});
  if (R.onb) {
    const items = [['Owner record and W-9','Received Nov 12','ok'],['Title · T-1195','Uploaded Nov 12 · in review','info'],['Owner-operator lease','Sent for e-signature Nov 12 · not signed yet','warn'],['Certificate of insurance','Physical damage and bobtail · missing','bad'],
      ['DOT annual inspection · T-1195','On file · valid to Aug 2027','ok'],['Maya’s driver file','Same person as this owner · medical card in review','info'],['ACH authorization','For weekly settlements · waiting','warn'],['IRP plates and IFTA decal','Ordered once the lease is signed','mu']];
    R.chk = {done:items.filter(i => i[2] === 'ok').length + ' of ' + items.length + ' done', pct:(items.filter(i => i[2] === 'ok').length / items.length * 100).toFixed(1) + '%', items:items.map(([t, d, k]) => ({t, d, k}))};
    R.cards = [C6('Equipment','1',' truck','T-1195 · not in service yet','brand','mu'), C6('Checklist','2',' of 8','Lease and insurance still missing','warn','warn'), C6('Lease','Not signed','','Sent for e-signature Nov 12','warn','mu'),
      C6('Insurance','Missing','','Physical damage and bobtail','bad','mu'), C6('Driver file','In review','','Medical card · same person','info','mu'), C6('Portal','Invited','','Nov 12 · not accepted yet','mu','mu')];
  }
  if (R.endc) {
    R.fa = {kv:[['Lease ended','Sep 30, 2026'],['Units returned','T-1144 and T-1152 · inspected Sep 30'],['Last weekly settlement','Sep 21–27 · paid Oct 3'],['Open chargebacks','None'],['Escrow to return','$5,000.00 plus interest through Sep 30'],['Due','Nov 14 · 45 days after the lease ended']].map(([k, v]) => ({k, v})),
      steps:[['Units returned and inspected','Sep 30','ok'],['Final weekly settlement paid','Oct 3','ok'],['Chargebacks reviewed · none open','Nov 10','ok'],['Escrow refund and final accounting','Due Nov 14','warn'],['1099-NEC for 2026','By Jan 31, 2027','mu']].map(([t, d, k]) => ({t, d, k}))};
    R.cards = [C6('Equipment','0',' trucks','2 returned Sep 30','mu','mu'), C6('Escrow to return','$5,000','','Due Nov 14','warn','warn'), C6('Paid in 2026','$118,420','','39 weekly settlements','ok','mu'),
      C6('Last settlement','Oct 3','','For Sep 21–27','info','mu'), C6('Portal','Read-only','','Until Dec 31','mu','mu'), C6('Owner for','4 yrs 7 mo','','Feb 2022 – Sep 2026','teal','mu')];
  }
  // where every dollar went
  const base = rev + trailerRent;
  R.mm = {title:'Where the money went · ' + rl + (pick ? ' · ' + pick : ''),
    steps:[{l:'Load revenue', s:n0f(nLoads) + ' loads · paid by customers', v:fm(rev), k:'v1'}, {l:'Lone Star’s share', s: pct + '% kept under the agreements', v:'−' + fm(carrier), k:'mu'}]
      .concat(trailerRent ? [{l:'Trailer rental', s:'$425 a trailer a week', v:'+' + fm(trailerRent), k:'v1'}] : [])
      .concat([{l:'Owner gross', s:'The owner’s share', v:fm(gross), k:'v1'}, {l:'Owner’s costs', s:'Deducted on the settlement', v:'−' + fm(-ded), k:'v2'}, {l:'Net settlement', s:'Paid to ' + short, v:fm(net), k:'v3'}]),
    bar: base ? [{k:'mu', w:(carrier / base * 100).toFixed(2) + '%', l:'Lone Star · ' + Math.round(carrier / base * 100) + '%'}, {k:'v2', w:(-ded / base * 100).toFixed(2) + '%', l:'Owner’s costs · ' + Math.round(-ded / base * 100) + '%'}, {k:'v3', w:(net / base * 100).toFixed(2) + '%', l:'Owner net · ' + Math.round(net / base * 100) + '%'}] : [],
    outside:[drvC ? ['Driver pay Lone Star paid its own drivers on these trucks', fm2(drvC), 'Company drivers are on driver statements, never on the owner’s'] : null,
      fuelC ? ['Fuel Lone Star bought for these trucks', fm2(fuelC), 'Lone Star pays fuel under the equipment lease and rental'] : null,
      o.id === 'AR' && (!pick || pick === 'T-1186') ? ['Jerome Banks’ pay', 'Not in FlyFleet', 'Alex hires and pays him directly'] : null].filter(Boolean).map(([t, v, s]) => ({t, v, s}))};
  // charts: revenue by truck, money over time, miles, per-mile split
  const mons = MON.map((m, i) => i === 5 ? 'Nov 1–13' : m);
  const mf = (x, i) => { const s = unitD(x.u), from = sinceIdx(x.since); return from < 0 || i < from ? 0 : MWK[i] * jit(s, i); };
  const tr5 = sel.filter(x => x.kind === 'truck');
  const series = tr5.slice(0, 6).map((x, j) => ({n:x.u, vals:MON.map((m, i) => r2(money(x).rev * mf(x, i))), k:VK[j]}));
  if (sel.some(x => x.kind === 'trailer')) series.push({n:'Trailer rental', vals:MON.map((m, i) => r2(sel.filter(x => x.kind === 'trailer').reduce((a, x) => a + 425 * mf(x, i), 0))), k:'v6'});
  R.ch1 = colStack(series, mons);
  const tot = k => MON.map((m, i) => r2(agg.reduce((a, r) => a + (r.m[k] || 0) * mf(r.x, i), 0)));
  R.ch2 = {...multiLine([{n:'Load revenue', vals:tot('rev'), k:'v1'}, {n:'Owner gross', vals:tot('gross'), k:'v4'}, {n:'Net to owner', vals:tot('net'), k:'v3'}], mons), aria:'Load revenue, owner gross and net to owner by month, June to November'};
  R.ch2.p = R.ch2.paths.map(p => p.d).concat(['', '', '']);
  R.ch3 = hbars(tr5.map((x, j) => ({n:x.u, v:Math.round((x.mi || 0) * rangeF(x, range)), s:x.co ? x.driver + ' & ' + x.co + ' · team' : x.driver, k:VK[j % 6]})).sort((a, b) => b.v - a.v), v => n0f(v) + ' mi');
  const pmMax = Math.max(0.01, ...tr5.map(x => money(x) && x.mi ? money(x).rev / x.mi : 0));
  R.ch4 = tr5.filter(x => x.mi).map(x => { const m = money(x), mi = x.mi, seg = (v, k, t) => ({k, w:(Math.max(0, v) / mi / pmMax * 72).toFixed(2) + '%', t:t + ' $' + (v / mi).toFixed(2) + ' a mile'});
    return {n:x.u, v:'$' + (m.rev / mi).toFixed(2), segs:[seg(m.carrier, 'mu', 'Lone Star'), seg(-m.ded, 'v2', 'Owner’s costs'), seg(m.net, 'v3', 'Owner net')]}; });
  // people and who drives what
  R.people = (PEOPLE5[o.id] || []).map(([n, ini, roles, d, note]) => ({n, ini, d, note, roles:roles.map(l => ({l, k:ROLEK(l)}))}));
  const who = trucks.map(x => { const w = WHO5(x), d = DRIVERS.find(dd => dd.n === x.driver);
    return {key:x.u, open:() => c.truck(x.u), cells:[lk(x.u, () => c.truck(x.u)), x.driver ? (d ? nk(x.driver, () => c.driver(x.driver)) : T.tx(x.driver)) : mu(''), x.co ? T.tx(x.co) : mu(''), T.tx(w[0], '', 't2'), T.tx(w[1], '', 't2'), T.tx(TERMS[x.terms].l, '', 't2')]}; });
  R.hasWho = who.length > 0;
  R.who = {cols:'80px 150px 120px 190px 290px 220px', head:[H('Truck'),H('Driver'),H('Co-driver'),H('Employed by'),H('How they’re paid'),H('Agreement')], rows:who, fz:'fz1'};
  // equipment
  R.eq = {cols:'76px 72px 52px 112px 136px 172px 92px 52px 76px 88px 96px 220px 150px 120px 196px 120px 176px 168px 92px', fz:'fz1',
    head:[H('Unit'),H('Type'),H('Year'),H('Make'),H('Model'),H('VIN'),H('Plate'),H('State'),H('Plate exp.'),H('Ownership',1),H('Owned since'),H('Agreement'),H('Driver'),H('Co-driver'),H('Driver works for'),H('Status'),H('Location'),H('Next service'),H('Odometer',1)],
    rows:all.map(x => ({key:x.u, open: x.kind === 'truck' ? () => c.truck(x.u) : noop, cells:[x.kind === 'truck' ? lk(x.u, () => c.truck(x.u)) : T.tx(x.u, '', 'mono w5'), T.tx(x.kind === 'truck' ? 'Truck' : x.ttype, '', 't2'), T.tx(String(x.year), '', 'num'), T.tx(x.make), T.tx(x.model),
      T.tx(x.vin, '', 'mono fs12 t2'), T.tx(x.plate, '', 'mono fs12'), T.tx(x.st, '', 'mono fs12 t2'), T.tx(x.exp, '', 'mono fs12 t2'), T.n(x.pctOwn + '%'), T.tx(x.since === 'Pending' ? 'Pending' : x.since, '', x.since === 'Pending' ? 'sk-warn' : 't2'),
      T.tx(TERMS[x.terms].l, TERMS[x.terms].s, '', 't3'), x.driver ? T.tx(x.driver) : mu(x.kind === 'trailer' ? 'Any Lone Star truck' : ''), x.co ? T.tx(x.co) : mu(''), x.kind === 'truck' ? T.tx(WHO5(x)[0], '', 't2') : mu(''),
      T.b(x.status, x.sk), T.tx(x.loc, x.fresh, '', LOC_K(x.fk)), T.tx(x.next, '', 't2'), x.odo ? T.n(x.odo) : mu('')]}))};
  // live tracking: the owner's units on the map, centred on them
  R.map = ownerMap(X, live);
  R.live = live.map(x => ({u:x.u, k: x.kind === 'trailer' ? 'violet' : 'brand', d: x.kind === 'trailer' ? x.ttype + ' trailer' : (x.co ? x.driver + ' & ' + x.co : x.driver), s:x.status, sk:x.sk, loc:x.loc, fresh:x.fresh, fk:LOC_K(x.fk), lane: x.lane ? x.load + ' · ' + x.lane : (x.kind === 'trailer' ? 'Not hooked to a truck' : 'No load now'), go: x.kind === 'truck' ? () => c.truck(x.u) : noop}));
  R.liveN = String(R.live.length); R.mm.hasOut = R.mm.outside.length > 0;
  R.liveSub = moving + ' of ' + trucks.length + ' trucks on loads · positions from the ELD every minute' + (trailers.length ? ' · trailers report every 15 min' : '');
  // loads and dispatch
  const LF = [['Active', l => l.active], ['Completed', l => l.st === 'Delivered'], ['Cancelled', l => l.st === 'Cancelled'], ['All', () => true]], li = Math.min(oload || 0, 3);
  R.lf = LF.map(([l, f], i) => ({l, n:String(loadsAll.filter(f).length), on: i === li ? 'on' : '', go:() => c.set({oload:i})}));
  const lrows = loadsAll.filter(LF[li][1]).map(l => { const x = U5[l.u], sh = shareOf(x, l);
    return {key:l.id, open: LOADS.find(z => z.id === l.id) ? () => c.open(l.id) : noop, cells:[LOADS.find(z => z.id === l.id) ? lk(l.id, () => c.open(l.id)) : T.tx(l.id, '', 'mono fs12 w5'), lk(l.u, () => c.truck(l.u)), T.tx(l.drv), T.tx(l.cust, '', 't2'), T.tx(l.o), T.tx(l.dst), T.tx(l.pu, '', 'num t2'), T.tx(l.del, '', 'num t2'),
      T.b(l.st, l.sk), l.mi ? T.n(n0f(l.mi)) : mu('')].concat(fin ? [T.m(fm2(l.lh)), T.m(l.fsc ? fm2(l.fsc) : '—', '', l.fsc ? '' : 'mu'), T.m(l.acc ? fm2(l.acc) : (l.tonu ? 'TONU' : '—'), '', l.acc || l.tonu ? '' : 'mu'), T.m(fm2(l.rev), '', 'w6'), T.m(l.tonu ? '—' : fm2(sh), x.terms === 'rent' ? '$0.30 × loaded mi' : '', l.tonu ? 'mu' : '')] : [])}; });
  R.lt = {cols:'88px 72px 170px 180px 130px 140px 72px 72px 120px 96px' + (fin ? ' 104px 112px 104px 112px 120px' : ''), fz:'fz1', rows:lrows,
    head:[H('Load'),H('Truck'),H('Driver'),H('Customer'),H('Origin'),H('Destination'),H('Pickup'),H('Delivery'),H('Status'),H('Loaded mi',1)].concat(fin ? [H('Line haul',1),H('Fuel surcharge',1),H('Accessorials',1),H('Total',1),H('Owner’s share',1)] : [])};
  const WKS = ['Sep 21','Sep 28','Oct 5','Oct 12','Oct 19','Oct 26','Nov 2','Nov 9'], wkL = tr5.reduce((a, x) => a + (x.loads || 0), 0);
  const onT = WKS.map((w, i) => { const t = i === 6 ? Math.max(1, wkL) : Math.max(1, Math.round(wkL * jit(unitD(tr5[0] ? tr5[0].u : '1') + 7, i) * (i === 7 ? 0.62 : 1))), late = Math.round(t * (0.04 + ((i * 7 + wkL) % 5) * 0.02)); return [t - late, late]; });
  R.ot = colStack([{n:'On time', vals:onT.map(v => v[0]), k:'v1'}, {n:'Late', vals:onT.map(v => v[1]), k:'v2'}], WKS.map((w, i) => i === 7 ? 'Nov 9 · to date' : w), v => String(Math.round(v)));
  const otT = onT.reduce((a, v) => a + v[0], 0), otL = onT.reduce((a, v) => a + v[1], 0);
  R.otSub = Math.round(otT / (otT + otL) * 1000) / 10 + '% on time over 8 weeks · ' + otL + ' late of ' + (otT + otL) + ' loads';
  // fuel and expenses
  const ftx = sel.flatMap(fuelTx);
  const gal = ftx.reduce((a, f) => a + parseFloat(f.gal), 0), spend = ftx.reduce((a, f) => a + f.amt, 0);
  R.fsum = [{l:'Gallons · Nov 2–8', v:n0f(Math.round(gal))}, {l:'Fuel spend', v:fm2(spend)}, {l:'Average price', v:'$' + (spend / Math.max(1, gal)).toFixed(3) + ' a gal'}, {l:'Paid by the owner', v:fm2(ftx.filter(f => f.by === 'owner').reduce((a, f) => a + f.amt, 0))}, {l:'Paid by Lone Star', v:fm2(ftx.filter(f => f.by === 'carrier').reduce((a, f) => a + f.amt, 0))}];
  R.ft = {cols:'64px 72px 150px 120px 110px 52px 80px 92px 104px 96px 200px 120px', fz:'fz1',
    head:[H('Date'),H('Truck'),H('Driver'),H('Truck stop'),H('City'),H('State'),H('Gallons',1),H('Price',1),H('Amount',1),H('Card'),H('Paid by'),H('On settlement')],
    rows:ftx.map(f => ({open:noop, cells:[T.tx(f.date, '', 'num t2'), lk(f.u, () => c.truck(f.u)), T.tx(f.drv), T.tx(f.stop), T.tx(f.city), T.tx(f.state, '', 'mono fs12 t2'), T.n(f.gal), T.m(f.ppg, '', 't2'), T.m(fm2(f.amt)), T.tx(f.card, '', 'mono fs12 t2'),
      T.tags([{v: f.by === 'owner' ? 'Owner' : 'Lone Star', k: f.by === 'owner' ? 'brand' : 'mu'}]), T.tx(f.by === 'owner' ? 'Deducted' : 'Not on it', '', f.by === 'owner' ? '' : 'mu')]}))};
  const xrows = [];
  sel.forEach(x => { const m = money(x); if (!m) return; m.dlines.filter(d => d[0] !== 'Fuel').forEach(([t, d, v]) => xrows.push({open:noop, cells:[T.tx('Nov 8', '', 'num t2'), lk(x.u, () => c.truck(x.u)), T.tx(t), T.tx(d || '—', '', d ? 't2' : 'mu'), T.m(fm2(v)), T.tags([{v:'Owner', k:'brand'}]), T.tx(/Escrow/.test(t) ? 'Held for the owner' : 'Deducted', '', 't2'), T.tx(/Repair|Driver pay/.test(t) ? 'Attached' : '—', '', /Repair|Driver pay/.test(t) ? '' : 'mu')]})); });
  sel.filter(x => TERMS[x.terms].driverBy === 'carrier' && x.drvPay).forEach(x => xrows.push({open:noop, cells:[T.tx('Nov 8', '', 'num t2'), lk(x.u, () => c.truck(x.u)), T.tx('Driver pay · ' + x.driver), T.tx('Lone Star’s company driver', '', 't2'), T.m(fm2(x.drvPay), '', 't2'), T.tags([{v:'Lone Star', k:'mu'}]), T.tx('Not on it', '', 'mu'), T.tx('Driver statement', '', 't2')]}));
  R.xt = {cols:'64px 72px 250px 330px 104px 110px 150px 130px', fz:'fz1', head:[H('Date'),H('Truck'),H('Expense'),H('Detail'),H('Amount',1),H('Paid by'),H('On settlement'),H('Receipt')], rows:xrows};
  const fmon = by => MON.map((m, i) => r2(sel.filter(x => x.fuel && TERMS[x.terms].fuelBy === by).reduce((a, x) => a + x.fuel * mf(x, i), 0)));
  R.fch = colStack([{n:'Paid by the owner', vals:fmon('owner'), k:'v1'}, {n:'Paid by Lone Star', vals:fmon('carrier'), k:'mu'}].filter(s2 => s2.vals.some(v => v > 0)), mons);
  // statements
  const per = live.map(x => ({x, m:money(x)})).filter(r => r.m);
  const strows = per.map(({x, m}) => { const t = TERMS[x.terms], fuel = t.fuelBy === 'owner' ? x.fuel || 0 : 0, run = x.payRun ? x.drvPay || 0 : 0, other = r2(-m.ded - fuel - run);
    return {open:() => c.stmt(o.id), cells:[lk(x.u, () => c.truck(x.u)), T.tx(t.l, t.s, '', 't3'), x.driver ? T.tx(x.co ? x.driver + ' & ' + x.co.split(' ')[0] : x.driver, WHO5(x)[0], '', 't3') : mu(''), T.n(x.loads ? String(x.loads) : '—'), T.n(x.mi ? n0f(x.mi) : '—'),
      T.m(m.rev ? fm2(m.rev) : '—', '', m.rev ? '' : 'mu'), T.m(m.carrier ? fm2(m.carrier) : '—', '', 't2'), T.m(fm2(m.gross)), T.m(fuel ? fm2(-fuel) : '—', '', fuel ? 't2' : 'mu'), T.m(run ? fm2(-run) : '—', '', run ? 't2' : 'mu'), T.m(other > 0.004 ? fm2(-other) : '—', '', other > 0.004 ? 't2' : 'mu'), T.m(fm2(m.net), '', 'w6')]}; });
  const W = ownerWeek(o.id);
  if (per.length) strows.push({cls:'tot', open:noop, cells:[T.tx('Total', '', 'w6'), mu(''), mu(''), T.n(String(per.reduce((a, r) => a + (r.x.loads || 0), 0))), T.n(n0f(per.reduce((a, r) => a + (r.x.mi || 0), 0))), T.m(fm2(W.rev)), T.m(fm2(W.carrier)), T.m(fm2(W.gross)),
    T.m(fm2(-per.reduce((a, r) => a + (TERMS[r.x.terms].fuelBy === 'owner' ? r.x.fuel || 0 : 0), 0))), T.m(W.drvPayRun ? fm2(-W.drvPayRun) : '—'), T.m(fm2(W.ded + per.reduce((a, r) => a + (TERMS[r.x.terms].fuelBy === 'owner' ? r.x.fuel || 0 : 0), 0) + W.drvPayRun)), T.m(fm2(W.net), '', 'w6')]});
  R.stt = {cols:'76px 230px 190px 60px 76px 112px 128px 112px 104px 120px 112px 120px', fz:'fz1', rows:strows,
    head:[H('Unit'),H('Agreement'),H('Driver'),H('Loads',1),H('Miles',1),H('Load revenue',1),H('Lone Star’s share',1),H('Owner gross',1),H('Fuel',1),H('Driver pay run',1),H('Other costs',1),H('Net',1)]};
  const PAST = [['Oct 26 – Nov 1','Nov 7',0.97,'Paid'],['Oct 19–25','Oct 31',1.04,'Paid'],['Oct 12–18','Oct 24',0.92,'Paid'],['Oct 5–11','Oct 17',1.01,'Paid'],['Sep 28 – Oct 4','Oct 10',0.95,'Paid'],['Sep 21–27','Oct 3',1.06,'Paid']];
  R.past = {cols:'150px 96px 112px 120px 112px 120px 96px 100px 72px', fz:'fz1', head:[H('Week'),H('Paid on'),H('Load revenue',1),H('Owner gross',1),H('Costs',1),H('Net paid',1),H('Status'),H('Escrow',1),H('')],
    rows: o.status === 'Onboarding' ? [] : PAST.map(([p, d, f, st]) => ({open:noop, cells:[T.tx(p, '', 'num'), T.tx(d, '', 'num t2'), T.m(fm2(W.rev * f)), T.m(fm2(W.gross * f)), T.m(fm2(W.ded * f), '', 't2'), T.m(fm2(W.net * f), '', 'w6'), T.b(st, 'completed'), T.m((ESCROW[o.id] || [0])[0] ? '$' + n0f(ESCROW[o.id][0]) : '—', '', 't2'), T.btn('PDF', noop, '')]}))};
  const esc = ESCROW[o.id] || [0, 0];
  R.esc = esc[1] || esc[0] ? {v:'$' + n0f(esc[0]), d: o.status === 'Ended' ? 'Refund due with the final accounting' : (esc[0] >= esc[1] ? 'Fully funded · target $' + n0f(esc[1]) : 'Building to $' + n0f(esc[1]) + ' · $78 a week'), i:'Interest paid quarterly · last paid Oct 1'} : {v:'None', d:'No escrow on this agreement', i:''};
  R.wk = [{l:'Load revenue · Nov 2–8', v:fm2(W.rev), s:'Customers paid', k:'v1'}, {l:'Lone Star’s share', v:fm2(-W.carrier), s:'Kept under the agreements', k:'mu'}, {l:'Owner gross', v:fm2(W.gross), s:'Before costs', k:'v1'},
    {l:'Owner’s costs', v:fm2(W.ded), s: W.drvPayRun ? 'Includes ' + fm2(W.drvPayRun) + ' driver pay' : 'Fuel, insurance, repairs', k:'v2'}, {l:'Net settlement', v:fm2(W.net), s:'Pays Fri Nov 14', k:'v3'}, {l:'Escrow held', v:R.esc.v, s:R.esc.d, k:'v4'}];
  R.stSub = o.status === 'Onboarding' ? 'No statements until the lease is signed' : 'Week of Nov 2–8 · pays Nov 14 · ' + (W.drvPayRun ? 'driver pay Lone Star ran for ' + short + ' is charged back here' : 'one settlement for every unit ' + short + ' owns');
  // maintenance
  const mrows = MAINT5.filter(r => all.some(x => x.u === r[1]) && (!pick || r[1] === pick));
  R.mt = {cols:'84px 76px 72px 250px 230px 112px 104px 170px 130px', fz:'fz1', head:[H('Work order'),H('Unit'),H('Date'),H('Work'),H('Shop'),H('Status'),H('Cost',1),H('Paid by'),H('On settlement')],
    rows:mrows.map(([wo, u, d, w, shop, st, k, cost, by]) => ({open:noop, cells:[T.tx(wo, '', 'mono fs12 w5'), lk(u, () => c.truck(u)), T.tx(d, '', 'num t2'), T.tx(w), T.tx(shop, '', 't2'), T.b(st, k), T.m(cost ? fm2(cost) : '—', '', cost ? '' : 'mu'),
      T.tags([{v: by === 'owner' ? 'Owner, under the lease' : 'Lone Star, under the rental', k: by === 'owner' ? 'brand' : 'mu'}]), T.tx(by === 'owner' && cost && st === 'Done' ? (d === 'Nov 5' || d === 'Nov 7' || d === 'Nov 6' ? 'This week' : 'Settled') : '—', '', by === 'owner' && cost ? 't2' : 'mu')]}))};
  R.upcoming = all.filter(x => !pick || x.u === pick).map(x => ({u:x.u, n:x.next, s: x.odo ? x.odo + ' mi on the odometer' : x.ttype + ' trailer', k: /in \d+ d|Return|due/.test(x.next) ? 'warn' : 'mu'}));
  // documents
  R.dt = {cols:'300px 110px 92px 96px 120px 170px 100px 120px', fz:'fz1', head:[H('Document'),H('Type'),H('Unit'),H('Uploaded'),H('Expires'),H('Status'),H('In portal'),H('')],
    rows:docs.filter(d2 => !pick || d2.u === pick || d2.u === 'All units' || d2.u === '—').map(d2 => ({open:noop, cells:[T.tx(d2.t, '', 'w5'), T.tx(d2.ty, '', 't2'), T.tx(d2.u, '', d2.u.indexOf('-') > 0 ? 'mono fs12' : 't2'), T.tx(d2.up, '', 'num t2'), T.tx(d2.exp, '', d2.k === 'warn' ? 'sk-warn' : 't2'), T.b(d2.st, d2.k), T.tx(d2.portal ? 'Shown' : 'Hidden', '', d2.portal ? 't2' : 'mu'), acts([['View', noop], ['Download', noop]])]}))};
  // access & permissions: real toggles, presets, and who signs in
  const setPerms = list => c.set({fv:{...fv, ...PERMS.reduce((a, [k]) => { a['perm.' + o.id + '.' + k] = list.includes(k) ? 'on' : 'off'; return a; }, {})}});
  const onList = PERM_ALL.filter(k => perm[k]), presetOn = (PERM_PRESETS.find(([, l]) => l.length === onList.length && l.every(k => perm[k])) || ['Custom'])[0];
  R.acc = {portal:o.portal, pk:o.pk, n:permN + ' of 12 on',
    presets:PERM_PRESETS.map(([l, list]) => ({l, on: l === presetOn ? 'on' : '', go:() => setPerms(list)})).concat([{l:'Custom', on: presetOn === 'Custom' ? 'on' : '', go:noop}]),
    perms:PERMS.map(([k, l]) => ({k, l, on: perm[k] ? 'on' : '', chk: perm[k] ? 'true' : 'false', go:() => c.setField('perm.' + o.id + '.' + k, perm[k] ? 'off' : 'on'),
      d:({equipment:'Units, specs, status', locations:'Map and last position', drivers:'Names and phone of drivers on their units', loads:'Active loads, no customer rates', completed:'Delivered loads with rated freight bills', fuel:'Fuel card purchases on their units',
        expenses:'Deductions with receipts', statements:'Weekly settlements and escrow', maintenance:'Work orders and costs', documents:'Lease, insurance, titles', download:'PDF and CSV exports', performance:'Miles, on-time, revenue per mile'})[k]})),
    users:(PORTAL5[o.id] || []).map(([n, ini, role, scope, last, k]) => ({n, ini, role, scope, last, k})),
    rules:['Owner logins see only units this owner owns, today. A sold or transferred unit drops out of their portal the same day.', 'Customer names and other loads’ rates are removed from everything they see.', 'Every change here is in the audit log, and the API enforces it, not just the screen.']};
  return R;
}

// ---------------------------------------------------------------- add / edit owner: individual or business, linked to an existing person, ownership per unit, status and access
DD_OPTS.units5 = Object.values(U5).map(x => ({v:x.u, l:x.u + ' · ' + x.year + ' ' + x.make + ' ' + x.model, ab: ownerOfUnit(x.u).cat === 'carrier' ? 'Company' : ownerOfUnit(x.u).name.split(' ')[0]}))
  .concat([{v:'T-1117', l:'T-1117 · 2023 Volvo VNL 760', ab:'Company'}, {v:'T-1155', l:'T-1155 · 2022 Kenworth T680', ab:'Company'}, {v:'T-1160', l:'T-1160 · 2024 Freightliner Cascadia', ab:'Company'}]);
DD_PH.units5 = 'Choose a unit'; DD_HEAD.units5 = 'Trucks and trailers';
DD_OPTS.terms5 = Object.entries(TERMS).map(([k, t]) => ({v:k, l:t.l + ' · ' + t.s.split(';')[0], ab:'', sh:({op70:'Owner-operator · 70%', op72:'Owner-operator · 72%', eq30:'Equipment lease · 30%', fl72:'Fleet lease · 72%', rent:'Rental · per mile'})[k]}));
DD_PH.terms5 = 'Choose an agreement'; DD_HEAD.terms5 = 'Agreement templates';
DD_OPTS.drives5 = [['owner','The owner drives it','The owner'],['company','Lone Star’s company driver','Lone Star driver'],['ownerhire','A driver the owner hires','Owner’s hire'],['none','Nobody · trailer','Nobody']].map(([v, l, sh]) => ({v, l, ab:'', sh}));
DD_PH.drives5 = 'Who drives it'; DD_HEAD.drives5 = 'Who drives';
const MATCH5 = [['Ben Okafor','BO','Company driver','D-1061 · drives T-1117 · hired Jan 2022','driver'],['Priya Shah','PS','Company driver','D-1088 · drives T-1155 · hired Feb 2023','driver'],['Mei Chen','MC','Employee · Accounting','Staff login · approves settlements','employee'],['Alex Rivera','AR','Already an owner','Owns T-1186 · open his owner record instead','owner']];
const PERSON5 = {'Ben Okafor':{first:'Ben', last:'Okafor', ph:'(469) 555-0110', email:'ben.okafor@example.com', addr:'4416 Ross Ave', city:'Dallas', state:'Texas', zip:'75204', tax:'SSN on file in HR · ending 6620', unit:'T-1117', id:'D-1061'},
  'Priya Shah':{first:'Priya', last:'Shah', ph:'(972) 555-0162', email:'priya.shah@example.com', addr:'1821 Spring Valley Rd', city:'Richardson', state:'Texas', zip:'75081', tax:'SSN on file in HR · ending 1975', unit:'T-1155', id:'D-1088'},
  'Mei Chen':{first:'Mei', last:'Chen', ph:'(214) 555-0102', email:'mei.chen@example.com', addr:'902 Henderson Ave', city:'Dallas', state:'Texas', zip:'75206', tax:'SSN on file in HR · ending 4410', unit:'', id:'E-207', staff:1}};
const STATE_NAME = {TX:'Texas', OK:'Oklahoma'};
function buildOwnerForm(X) {
  const {c, fin, fv, ofMode, ofId, ofPreset, ofExtra} = X;
  const edit = ofMode === 'edit' && own5(ofId) && ofId !== 'LSF', o = edit ? own5(ofId) : null, pre = 'of.' + (edit ? o.id : 'new') + '.';
  const g = (k, d) => fv[pre + k] !== undefined ? fv[pre + k] : d, set = (k, v) => c.setField(pre + k, v);
  const entity = g('entity', edit ? o.entity : (ofPreset === 'business' ? 'business' : 'individual')), biz = entity === 'business';
  const link = edit ? (o.person && OP_DRIVERS[o.person] ? o.person : '') : g('link', ofPreset === 'linked' ? 'Ben Okafor' : ''), P = !edit && PERSON5[link] ? PERSON5[link] : null;
  const fi = (k, l, v, span, o2) => ({k, l, v:v || '', span:String(span), ph:(o2 && o2.ph) || '', mono:(o2 && o2.mono) ? 'mono' : '', hint:(o2 && o2.hint) || '', req:(o2 && o2.req) ? 'req' : '', id:'of-' + k, isInput:!(o2 && o2.ro), isRo:!!(o2 && o2.ro), isDd:false, isSeg:false});
  const seg = (k, l, opts, cur, span, hint) => ({k, l, span:String(span), hint:hint || '', isSeg:true, isInput:false, isRo:false, isDd:false, opts:opts.map(([v, lab]) => ({l:lab, on: v === cur ? 'on' : '', p: v === cur ? 'true' : 'false', go:() => set(k, v)}))});
  const dd = (k, l, list, v, span, hint) => { const f = ddField({l, v, dd:list}, pre + k, X), cv = fv[pre + k] !== undefined ? fv[pre + k] : v, cur = ddOpts(list).find(o2 => o2.v === cv);
    const sh = cur ? (list === 'units5' ? cur.v : (cur.sh || cur.l)) : (cv || DD_PH[list]);
    return {...f, k, l, span:String(span), hint:hint || '', isRo:false, hasOther:false, showOther:false, req:'', shown:sh, aria:l + ': ' + (cur ? cur.l : sh), vcls: cv ? '' : 'mu', ab: list === 'units5' && cur ? cur.ab : (list === 'states' ? f.ab : '')}; };
  const ro = !!P, from = P ? 'From ' + link.split(' ')[0] + '’s ' + (P.staff ? 'staff' : 'driver') + ' record' : '';
  const ident = biz ? [
      fi('legal', 'Legal business name', edit ? o.name : '', 4, {ph:'As on the W-9', req:1}), fi('dba', 'DBA', edit ? o.dba : '', 2, {ph:'Optional'}),
      fi('ein', 'EIN', edit ? '••-•••' + o.tax.slice(-4) : '', 2, {ph:'12-3456789', mono:1, req:1, hint:'Encrypted · only the last 4 show'}), seg('btype', 'Business type', [['llc','LLC'],['corp','Corporation'],['part','Partnership'],['sole','Sole proprietor']], g('btype', edit && /Inc\./.test(o.name) ? 'corp' : 'llc'), 4),
      fi('cfirst', 'Contact first name', edit ? (o.contact || '').split(' ')[0] : '', 2, {ph:'First name', req:1}), fi('clast', 'Contact last name', edit ? (o.contact || '').split(' ').slice(1).join(' ') : '', 2, {ph:'Last name', req:1}), fi('ctitle', 'Contact title', edit ? o.ctitle : '', 2, {ph:'Principal, president…'})]
    : [fi('first', 'First name', P ? P.first : (edit ? o.first : ''), 2, {ph:'First name', req:1, ro, hint:from}), fi('last', 'Last name', P ? P.last : (edit ? o.last : ''), 2, {ph:'Last name', req:1, ro}),
      fi('dba', 'DBA', edit ? o.dba : '', 2, {ph:'Optional · e.g. Reyes Trucking'}), fi('tin', 'SSN or EIN', P ? P.tax : (edit ? '•••-••-' + o.tax.slice(-4) : ''), 3, {ph:'For the 1099', mono:!P, req:1, ro, hint: P ? 'Reused, never re-entered' : 'Encrypted · only the last 4 show'})];
  const contact = [fi('email', 'Email', P ? P.email : (edit ? o.email : ''), 3, {ph:'name@example.com', req:1, hint: P ? 'Prefilled · you can change it' : 'Statements and portal invites go here'}), fi('ph', 'Phone', P ? P.ph : (edit ? o.ph : ''), 3, {ph:'(214) 555-0100', mono:1, req:1, ro, hint:from}),
    fi('addr', 'Street address', P ? P.addr : (edit ? o.addr : ''), 6, {ph:'Street and number', req:1}), fi('city', 'City', P ? P.city : (edit ? o.city : ''), 2, {ph:'City', req:1}),
    dd('state', 'State', 'states', P ? P.state : (edit ? STATE_NAME[o.state] || o.state : ''), 2), fi('zip', 'ZIP', P ? P.zip : (edit ? o.zip : ''), 2, {ph:'75201', mono:1, req:1})];
  // ownership: one row per unit; who drives each one decides the category
  const base = edit ? unitsOf(o.id).map(x => ({u:x.u, pct:String(x.pctOwn), since: x.since === 'Pending' ? 'Pending' : x.since, terms:x.terms, drives: x.works || 'none', st: x.since === 'Pending' ? 'Onboarding' : 'Active'}))
    : (P && P.unit ? [{u:P.unit, pct:'100', since:'Nov 16, 2026', terms:'op70', drives:'owner', st:'Starts Nov 16'}] : [{u:'', pct:'100', since:'', terms:'', drives:'', st:''}]);
  for (let i = 0; i < (ofExtra || 0); i++) base.push({u:'', pct:'100', since:'', terms:'', drives:'', st:''});
  const rows = base.map((r, i) => { const k = 'u' + i + '.', drv = g(k + 'drives', r.drives), unit = g(k + 'unit', r.u);
    return {ufld:dd(k + 'unit', 'Unit', 'units5', r.u, 1), terms:dd(k + 'terms', 'Agreement', 'terms5', r.terms, 1), drives:dd(k + 'drives', 'Who drives', 'drives5', r.drives, 1),
      pct:r.pct, since:r.since, st:r.st || 'Active', sk: /Pending|Onboarding|Starts/.test(r.st) ? 'info' : 'ok', drv, unit,
      note: unit ? (r.pct === '100' ? unit + ' · 100% · Lone Star keeps no share of the title' : 'The other ' + (100 - +r.pct) + '% stays with Lone Star Freight LLC') : 'Pick a truck or trailer', rm:noop}; });
  const drivesOwn = rows.some(r => r.drv === 'owner'), cat = drivesOwn ? 'op' : 'nonop';
  const status = g('status', edit ? o.status : 'Onboarding');
  const portal = g('portal', edit ? (o.pk === 'mu' ? 'off' : 'on') : 'on') === 'on';
  const pid = edit ? o.id : 'NEW', perm = permOf(fv, pid), def = !edit;
  const permsOn = PERMS.map(([k, l]) => { const v = fv['perm.' + pid + '.' + k], on = v !== undefined ? v === 'on' : (def ? PERM_ALL.includes(k) : !!perm[k]); return {k, l, on: on ? 'on' : '', chk: on ? 'true' : 'false', go:() => c.setField('perm.' + pid + '.' + k, on ? 'off' : 'on')}; });
  const onKeys = permsOn.filter(p => p.on).map(p => p.k);
  const preset = (PERM_PRESETS.find(([, l]) => l.length === onKeys.length && l.every(k => onKeys.includes(k))) || ['Custom'])[0];
  const setPerms = list => c.set({fv:{...fv, ...PERMS.reduce((a, [k]) => { a['perm.' + pid + '.' + k] = list.includes(k) ? 'on' : 'off'; return a; }, {})}});
  const name = biz ? (edit ? o.name : 'New business owner') : (P ? link : (edit ? o.name : 'New owner'));
  const R = {edit, title: edit ? 'Edit owner' : 'Add owner', crumb: edit ? o.name : 'Add owner', back:() => edit ? c.owner(o.id) : c.go('owners'),
    sub: edit ? 'Changes are saved to the owner record and the audit log. Units you remove keep their history.' : 'An owner is a person or a business. If they already drive or work here, link them so nobody exists twice.',
    ent:[['individual','Individual','A person · SSN or EIN'],['business','Business','LLC, corporation or partnership · EIN']].map(([v, l, d]) => ({l, d, on: v === entity ? 'on' : '', p: v === entity ? 'true' : 'false', go:() => set('entity', v)})),
    showMatch: !edit && !biz, linked: P ? {n:link, ini:MATCH5.find(m => m[0] === link)[1], role:MATCH5.find(m => m[0] === link)[2], d:MATCH5.find(m => m[0] === link)[3], unlink:() => set('link', '')} : null,
    matches: !edit && !biz && !P ? MATCH5.map(([n, ini, role, d, kind]) => ({n, ini, role, d, owner: kind === 'owner', k: kind === 'owner' ? 'mu' : 'brand', b: kind === 'owner' ? 'Open' : 'Link', go: kind === 'owner' ? () => c.owner('AR') : () => set('link', n)})) : [],
    ident, contact, rows, addUnit:() => c.set({ofExtra:(ofExtra || 0) + 1}),
    cat:{l:CAT5[cat], k: cat === 'op' ? 'brand' : 'teal', d: drivesOwn ? 'Because ' + (P ? P.first : (edit && o.first ? o.first : 'the owner')) + ' drives ' + (rows.find(r => r.drv === 'owner').unit || 'a unit') + '. Set from “Who drives”, so it can’t drift.' : (rows.some(r => r.drv) ? 'Nobody on this record drives their own unit. Set from “Who drives”.' : 'Set automatically once you pick who drives each unit.')},
    status:['Active','Onboarding','Suspended','Ended'].map(v => ({l:v, on: v === status ? 'on' : '', p: v === status ? 'true' : 'false', go:() => set('status', v)})),
    statusD:({Active:'Units can be dispatched and settled every week.', Onboarding:'Units stay out of dispatch until the lease, insurance and W-9 are in.', Suspended:'Units can’t take new loads; open settlements still pay.', Ended:'Units leave the owner’s portal; escrow is returned with a final accounting within 45 days.'})[status],
    fin, pay: fin ? [seg('freq', 'Settlement', [['wk','Weekly · Friday'],['bi','Every 2 weeks']], g('freq', 'wk'), 3), seg('method', 'Payment', [['ach','ACH'],['check','Check']], g('method', 'ach'), 3),
      fi('bank', 'Bank', edit ? 'Frost Bank' : '', 2, {ph:'Bank name'}), fi('routing', 'Routing number', edit ? '•••••' + '0127' : '', 2, {ph:'9 digits', mono:1}), fi('acct', 'Account number', edit ? '••••••' + '6612' : '', 2, {ph:'Encrypted', mono:1, hint:'Only the last 4 show'}),
      fi('escrow', 'Escrow per truck', '$2,500', 2, {mono:1, hint:'Interest paid quarterly'}), fi('esdep', 'Weekly escrow deposit', '$78', 2, {mono:1, hint:'Until the target is reached'})] : [],
    portal, portalTog:() => set('portal', portal ? 'off' : 'on'), portalChk: portal ? 'true' : 'false', portalOn: portal ? 'on' : '',
    loginEmail: P ? P.email : (edit ? o.email : ''), perms:permsOn, permN: onKeys.length + ' of 12',
    presets:PERM_PRESETS.map(([l, list]) => ({l, on: l === preset ? 'on' : '', go:() => setPerms(list)})).concat([{l:'Custom', on: preset === 'Custom' ? 'on' : '', go:noop}]),
    cancel:() => edit ? c.owner(o.id) : c.go('owners'), save:() => { if (edit) c.owner(o.id); else { c.go('owners'); c.created('owner'); } }, saveL: edit ? 'Save changes' : (portal ? 'Save and send invite' : 'Save owner'),
    identT: biz ? 'Business' : 'Person', identS: biz ? 'The owner on record is the business; the contact acts for it' : (P ? 'Read-only fields come from the linked record' : 'The owner on record is this person')};
  R.hasMatches = R.matches.length > 0;
  // what gets saved, in plain words
  const sv = [];
  sv.push(['Person', P ? link + ' · existing record ' + P.id + (P.staff ? ' (staff)' : '') : (biz ? 'Business: ' + name : (edit ? o.name + ' · existing record' : 'A new person record')), P ? 'Linked, not copied. One record, more roles.' : '']);
  sv.push(['Roles after saving', (P ? (P.staff ? 'Employee (kept) · Owner (new)' : 'Driver (kept) · Owner (new)') : (edit ? (o.roles || ['Owner']).join(' · ') : 'Owner')) + (portal ? ' · Portal user' : ''), '']);
  sv.push(['Category', CAT5[cat], 'From who drives each unit']);
  sv.push(['Units', rows.filter(r => r.unit).map(r => r.unit + ' · ' + r.pct + '%').join(', ') || 'None yet', '']);
  sv.push(['Status', status, '']);
  if (portal) sv.push(['Portal', preset + ' · ' + onKeys.length + ' of 12 permissions', 'Invite goes to ' + (R.loginEmail || 'their email')]);
  R.summary = sv.map(([l, v, s]) => ({l, v, s}));
  R.change = P && P.staff ? {t:'What changes for ' + P.first, keep:['Her staff login, role and payroll', 'Her access to accounting screens'], moveT:'New rules', move:['She gets a separate owner login that sees only her units', 'She can’t approve her own settlement: Dana Kim approves it instead', 'Loads on her units are flagged in dispatch for a second look']}
    : P ? {t:'What changes for ' + P.first, keep:['CDL, medical card, drug and alcohol program', 'Hours of service, ELD and the driver app login', 'Safety record and his ' + P.id + ' file'],
    moveT:'Changes on Nov 16', move:['Title to ' + P.unit + ' moves from Lone Star to ' + P.first + ' on Nov 16', 'Paid on a weekly owner settlement instead of a W-2 driver statement · his last driver statement covers Nov 9–15', 'Fuel, insurance and repairs on ' + P.unit + ' become his costs under the owner-operator lease']} : null;
  R.checks = (P || !edit ? [['Signed lease or rental agreement', 'Sent for e-signature after saving', 'warn'], ['Certificate of insurance', 'Physical damage and bobtail', 'warn'], ['Title or bill of sale', 'For each unit', 'warn'], ['W-9', P ? 'New one needed for a 1099' : 'Needed for a 1099', 'warn'], ['ACH authorization', 'For weekly settlements', 'warn']]
    : [['Lease on file', 'Signed ' + o.since, 'ok'], ['Certificate of insurance', 'Valid to Jun 30, 2027', 'ok'], ['W-9', 'On file', 'ok']]).map(([t, d, k]) => ({t, d, k}));
  R.dupWarn = !edit && !biz && !P;
  R.checksT = edit ? 'Paperwork on file' : 'Before the first load';
  return R;
}
ADD.owner.done = 'Owner saved · lease sent for e-signature · no duplicate person created';

// ---------------------------------------------------------------- owner settlement: one statement, a section per unit, and what is NOT on it
const STMT_ST = {TR:['In review','info'], LO:['Approved','ok'], JH:['In review','info'], CT:['In review','info'], PC:['Approved','ok'], AR:['In review','info'], KL:['Final accounting','warn']};
function buildStmt(X) {
  const {c, fin, stmtId, roleKey} = X;
  const o = stmtId && stmtId !== 'LSF' && own5(stmtId) && own5(stmtId).status !== 'Onboarding' ? own5(stmtId) : own5('TR');
  const W = ownerWeek(o.id), short = o.entity === 'business' ? o.name.replace(/ (LLC|Inc\.)$/, '') : o.first, st = STMT_ST[o.id] || ['Draft','draft'];
  const approver = roleKey === 'owner' || roleKey === 'accounting';
  const L = (t, s, v, cls) => ({t, s:s || '', v: typeof v === 'number' ? fm2(v) : v, vc: typeof v === 'number' && v < 0 ? 't2' : '', cls:cls || ''});
  const secs = W.per.map(({x, m}) => { const t = TERMS[x.terms], lines = [];
    m.lines.forEach(([a, b, v]) => lines.push(L(a, b, v)));
    lines.push(L('Owner gross · ' + x.u, '', m.gross, 'sum'));
    m.dlines.forEach(([a, b, v]) => lines.push(L(a, a.indexOf('Driver pay') === 0 && x.team ? x.team + ' × $0.70' : (a.indexOf('Driver pay') === 0 ? b + ' · ' + n0f(x.mi) + ' mi × $0.60' : b), v)));
    lines.push(L('Net · ' + x.u, '', m.net, 'net'));
    const not = [];
    if (t.driverBy === 'carrier' && x.drvPay) not.push([x.driver + '’s pay', fm2(x.drvPay), 'Lone Star pays its company driver on a driver statement']);
    if (t.fuelBy === 'carrier' && x.fuel) not.push(['Fuel for ' + x.u, fm2(x.fuel), 'Lone Star buys fuel under the ' + (x.terms === 'rent' ? 'rental' : 'equipment lease')]);
    if (x.works === 'ownerhire' && !x.payRun && x.kind === 'truck') not.push([x.driver + '’s pay', 'Not in FlyFleet', short + ' hires and pays this driver directly']);
    const w = WHO5(x);
    return {u:x.u, kind: x.kind === 'truck' ? 'Truck' : x.ttype + ' trailer', title:x.u + ' · ' + unitTitle(x), terms:t.l, ts:t.s, drv: x.kind === 'truck' ? (x.co ? x.driver + ' & ' + x.co + ' · team' : x.driver) + ' · ' + (x.works === 'owner' ? 'the owner drives it' : w[0]) : 'Rented whether loaded or not',
      lines, not:not.map(([a, v, d]) => ({a, v, d})), hasNot: not.length > 0, k: x.works === 'owner' ? 'brand' : (x.works === 'company' ? 'mu' : 'teal'), go:() => c.truck(x.u), net:fm2(m.net)}; });
  const loads = W.per.flatMap(({x}) => weekLoads(x).map(l => ({l, x})));
  const R = {o, n:o.name, ini:oIni(o), short, period:'Week of Nov 2–8, 2026', pays:'Pays Fri Nov 14 · ACH to ' + (o.entity === 'business' ? 'business checking' : 'checking') + ' ••6612', st:st[0], sk:st[1],
    back:() => c.owner(o.id), toOwner:() => c.owner(o.id), toList:() => c.set({screen:'settlements', ltab:1, drawer:null, overlay:'none', modal:'none'}), canApprove: approver && st[0] === 'In review', noFin: !fin,
    sum:[{l:'Load revenue', v:fm2(W.rev), s:loads.length + ' loads · customers paid', k:'v1'}, {l:'Lone Star’s share', v:fm2(-W.carrier), s:'Kept under the agreements', k:'mu'}, {l:'Owner gross', v:fm2(W.gross), s:'Before costs', k:'v1'},
      {l:'Costs', v:fm2(W.ded), s: W.drvPayRun ? 'Includes ' + fm2(W.drvPayRun) + ' driver pay' : 'Fuel, insurance, repairs, escrow', k:'v2'}, {l:'Net settlement', v:fm2(W.net), s:'Paid to ' + short, k:'v3'}],
    secs, many: secs.length > 1,
    callout: o.id === 'TR' ? {t:'One person, one settlement', d:'Tom drives T-1129 and owns T-1102, which Lone Star’s Sam Whitfield drives. Tom is paid only here, never on a driver statement too, and nothing for Sam’s pay or T-1102’s fuel comes out of it.'}
      : (o.id === 'CT' ? {t:'Driver pay Lone Star ran for Castillo', d:'Castillo hires its 5 drivers, including the Ito–Walsh team. Lone Star runs their pay as a service ($' + n0f(W.drvPayRun) + ' this week) and charges it back here, itemized per driver, so every chargeback has a line and a reason.'}
      : (o.id === 'PC' ? {t:'Rental, not a share of revenue', d:'Pecan Creek is paid $0.30 a mile for trucks and $425 a week for each trailer, whether it is loaded or not. Lone Star pays the drivers and the fuel, so neither appears here.'}
      : (o.id === 'AR' ? {t:'Alex pays Jerome himself', d:'Alex hires Jerome Banks and pays him outside FlyFleet, so no driver pay is charged here. Alex is also a dispatcher; his staff pay is payroll and never touches this settlement.'} : null))),
    lt:{cols:'92px 72px 72px 140px 150px 80px 104px 104px 96px 112px 120px 104px', fz:'fz1', head:[H('Load'),H('Truck'),H('Delivered'),H('Origin'),H('Destination'),H('Miles',1),H('Line haul',1),H('Fuel surcharge',1),H('Accessorials',1),H('Total',1),H('Owner’s share',1),H('Freight bill')],
      rows:loads.map(({l, x}) => ({open:noop, cells:[T.tx(l.id, '', 'mono fs12 w5'), lk(l.u, () => c.truck(l.u)), T.tx(l.del, '', 'num t2'), T.tx(l.o), T.tx(l.dst), T.n(n0f(l.mi)), T.m(fm2(l.lh)), T.m(fm2(l.fsc)), T.m(l.acc ? fm2(l.acc) : '—', '', l.acc ? '' : 'mu'), T.m(fm2(l.rev), '', 'w6'), T.m(fm2(shareOf(x, l))), T.btn('View', noop, '')]}))},
    ltNote:'The owner’s copy of each rated freight bill shows the rate and charges; shipper and consignee names are removed, as 49 CFR 376.12(g) allows.',
    esc: ESCROW[o.id] && ESCROW[o.id][1] ? [['Balance', '$' + n0f(ESCROW[o.id][0])], ['Target', '$' + n0f(ESCROW[o.id][1])], ['Deposit this week', W.per.some(r => r.x.escw) ? fm2(W.per.reduce((a, r) => a + (r.x.escw || 0), 0)) : 'None · fully funded'], ['Interest', 'Paid quarterly · last Oct 1']].map(([k, v]) => ({k, v})) : [{k:'Escrow', v:'None on this agreement'}],
    trail:[['System','Prepared from delivered loads and fuel card data','Nov 9 · 06:00','mu'],['Mei Chen · Accounting','Matched the repair invoices and the driver pay run','Nov 10 · 14:22','info'],
      [st[0] === 'Approved' ? 'Dana Kim · Main Admin' : 'Waiting on approval', st[0] === 'Approved' ? 'Approved for payment' : 'Main Admin or Accounting approves', st[0] === 'Approved' ? 'Nov 12 · 09:05' : 'Due Nov 13', st[0] === 'Approved' ? 'ok' : 'warn'],
      ['ACH', 'Pays within 15 days of the delivery paperwork, as the lease requires', 'Nov 14', 'mu']].map(([who, what, when, k]) => ({who, what, when, k})),
    netV:fm2(W.net), rules:['Every deduction is itemized with what it is for and how it was figured; receipts are attached.', 'The owner can dispute any line from the portal for 30 days.', 'Escrow earns interest paid at least every quarter and comes back within 45 days of the lease ending.']};
  return R;
}

// ---------------------------------------------------------------- truck record: specs, owner and agreement, drivers, ownership and assignment history
const HIST5 = {'T-1102':[['Mar 2026','Tom Reyes','Bought from Lone Star Freight · title transferred · now on an equipment lease','brand'],['Jun 2021','Lone Star Freight LLC','Bought new from Freightliner of Dallas','mu']],
  'T-1180':[['Aug 2026','Castillo Transport LLC','Bought from Kowalski Leasing · leased on to Lone Star','teal'],['Feb 2022','Kowalski Leasing Inc.','Leased on until the Kowalski lease ended','mu'],['Jan 2022','Kowalski Leasing Inc.','Bought new','mu']]};
const ASG5 = {'T-1102':[['Sam Whitfield','Lone Star company driver','Mar 2026','Now'],['Victor Hale','Lone Star company driver, while Lone Star owned it','Jun 2021','Feb 2026']],
  'T-1171':[['Darius Johnson & Nia Johnson','Team · 50/50','Jan 2023','Now']], 'T-1180':[['Ken Ito & Katie Walsh','Team · by miles each drove','Aug 2026','Now']]};
function buildTruck(X) {
  const {c, fin, truckId} = X;
  const u = truckId || 'T-1102', x = U5[u], tr = TRUCKS.find(t => t[0] === u) || TRUCKS[0], tx = TRUCK_X[u] || ['', '', '', '', '', '', 'mu'];
  const [mk, yr] = tr[1].split(' · '), o = ownerOfUnit(u), team = TRUCK_TEAM[u];
  const make = x ? x.make : mk.split(' ')[0], model = x ? x.model : tx[1].replace(' · sleeper', ''), year = x ? x.year : +yr, vin = vinOf(make, year, u);
  const driver = team ? team[0] : (x ? x.driver : (DRIVERS.find(d => 'T-' + d.t === u) || {}).n), co = team ? team[1] : (x ? x.co : '');
  const t = x ? TERMS[x.terms] : null, m = x ? money(x) : null;
  const plate = x ? x.plate : tr[2].split(' · ')[1], st = x ? x.status : tr[3], sk = x ? x.sk : tr[4];
  const hist = (HIST5[u] || (o.cat === 'carrier' ? [[String(year), 'Lone Star Freight LLC', 'Bought new · owned outright', 'mu']] : [[x.since, o.name, 'Leased on to Lone Star · ' + t.l.toLowerCase(), o.cat === 'op' ? 'brand' : 'teal'], [String(year), o.name, 'Bought ' + (year >= 2022 ? 'new' : 'used'), 'mu']]))
    .map(([d, who, what, k]) => ({d, who, what, k}));
  const asg = (ASG5[u] || [[driver || 'No driver', x ? WHO5(x)[0] : 'Lone Star company driver', x && x.since !== 'Pending' ? x.since : 'Jan 2026', 'Now']]).map(([n, how, from, to]) => ({n, how, from, to}));
  const R = {u, title:year + ' ' + make + ' ' + model, st, sk, back:() => c.go('trucks'), assign:() => c.assign(), fin, ownTag: o.cat === 'carrier' ? 'Company fleet' : 'Owned by ' + o.name,
    owner:{n: o.cat === 'carrier' ? 'Lone Star Freight LLC' : o.name, cat: o.cat === 'carrier' ? 'Company fleet' : CAT5[o.cat], k: o.cat === 'op' ? 'brand' : (o.cat === 'carrier' ? 'mu' : 'teal'), go: o.cat === 'carrier' ? noop : () => c.owner(o.id), link: o.cat !== 'carrier',
      kv:[['Ownership', x ? x.pctOwn + '% · since ' + x.since : '100% · owned outright'], ['Agreement', t ? t.l : 'None · company equipment'], ['Terms', t ? t.s : 'Lone Star keeps all revenue'], ['Fuel paid by', t ? (t.fuelBy === 'owner' ? 'The owner, on the settlement' : 'Lone Star') : 'Lone Star'],
        ['Driver paid by', x ? WHO5(x)[1] : 'Lone Star, on a driver statement'], ['Owner portal', o.cat === 'carrier' ? '—' : 'Shown to ' + o.name.split(' ')[0] + ' today']].map(([k, v]) => ({k, v}))},
    now:{loc: x ? x.loc : tx[4], fresh: x ? x.fresh : tx[5], fk:LOC_K(x ? x.fk : tx[6]), load: x && x.load ? x.load + ' · ' + x.lane : (tr[7] && tr[7] !== '—' ? tr[7] : 'No load'), next: x ? x.next : tr[8], odo:(x ? x.odo : tr[6]) + ' mi'},
    drivers:[driver ? {n:driver, ini:driver.split(' ').map(w => w[0]).join('').slice(0, 2), r: team ? 'Team driver · ' + team[2] : (x ? WHO5(x)[0] : 'Company driver'), go: DRIVERS.find(d => d.n === driver) ? () => c.driver(driver) : noop} : null,
      co ? {n:co, ini:co.split(' ').map(w => w[0]).join('').slice(0, 2), r:'Team driver · ' + (team ? team[2] : ''), go: DRIVERS.find(d => d.n === co) ? () => c.driver(co) : noop} : null].filter(Boolean),
    team: team ? {t:'Team truck', d:team[0].split(' ')[0] + ' and ' + team[1].split(' ')[0] + ' run it together and split pay ' + (team[2] === '50/50' ? '50/50 on team miles' : 'by the miles each one drove') + '. Hours are logged per driver on the ELD; dispatch sees one truck, two drivers.'} : null,
    specs:[['VIN', vin], ['Year', String(year)], ['Make', make], ['Model', model], ['Plate', plate], ['Plate state', x ? x.st : 'TX'], ['Plate expires', x ? x.exp : tx[2]], ['Odometer', (x ? x.odo : tr[6]) + ' mi'],
      ['Engine', make === 'Freightliner' || make === 'International' ? 'Detroit DD15 · 505 hp' : (make === 'Volvo' ? 'Volvo D13 · 500 hp' : 'PACCAR MX-13 · 510 hp')], ['Transmission', 'Automated manual · 12 speed'], ['ELD', 'Samsara VG55 · ' + u.replace('T-', 'SV')], ['Fuel card', 'WEX ••' + String(4000 + unitD(u) % 1000).slice(-4)]].map(([k, v]) => ({k, v})),
    hist, asg, wk: fin && m ? [['Load revenue', fm2(m.rev)], ['Lone Star’s share', fm2(m.carrier)], ['Owner gross', fm2(m.gross)], ['Owner’s costs', fm2(m.ded)], ['Net to owner', fm2(m.net)], ['Driver pay', fm2(m.drvPay || 0) + ' · ' + m.drvBy]].map(([k, v]) => ({k, v})) : null,
    maint:MAINT5.filter(r => r[1] === u).map(([wo, , d, w, shop, s, k, cost]) => ({wo, d, w, shop, s, k, cost: cost ? fm2(cost) : '—'})),
    docs:[['Registration cab card', 'Expires ' + (x ? x.exp : tx[2]), 'ok'], ['DOT annual inspection', 'Valid to Mar 14, 2027', 'ok'], [o.cat === 'carrier' ? 'Title · Lone Star Freight LLC' : 'Title · ' + o.name, 'On file', 'ok'], ['IFTA decal and permit book', '2026 · in the cab', 'ok']].map(([t2, d, k]) => ({t:t2, d, k}))};
  R.noMaint = R.maint.length === 0;
  return R;
}

// ---------------------------------------------------------------- owner portal v2: what the owner sees, and only what their permissions allow
const PTABS = [['ov','Overview',''],['eq','Equipment','equipment'],['loads','Loads','loads|completed'],['stmt','Statements','statements'],['exp','Fuel & expenses','fuel|expenses'],['mt','Maintenance','maintenance'],['docs','Documents','documents']];
const wks26 = x => { const m = /^(\w{3}) (\d{4})$/.exec(x.since || ''); if (!m || +m[2] < 2026) return 45; return Math.max(1, Math.round(45 - ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov'].indexOf(m[1]) * 4.35)); };
function buildOwnerPortal5(X) {
  const {c, ownerId, fv, ptab, opPreview} = X;
  const o = ownerId !== 'LSF' && own5(ownerId) && own5(ownerId).status !== 'Onboarding' ? own5(ownerId) : own5('CT');
  const perm = permOf(fv, o.id), has = p => !p || p.split('|').some(q => perm[q]);
  const tabs = PTABS.filter(t => has(t[2])), tab = tabs.some(t => t[0] === ptab) ? ptab : 'ov';
  const user = (PORTAL5[o.id] || [['Owner','OW']])[0], first = user[0].split(' ')[0], short = o.entity === 'business' ? o.name.replace(/ (LLC|Inc\.)$/, '') : o.name;
  const all = unitsOf(o.id).filter(x => x.since !== 'Pending'), trucks = all.filter(x => x.kind === 'truck'), trailers = all.filter(x => x.kind === 'trailer');
  const W = ownerWeek(o.id), rent = all.every(x => x.terms === 'rent'), moving = trucks.filter(x => x.sk === 'transit' || x.sk === 'assigned').length;
  const ytd = r2(W.per.reduce((a, r) => a + r.m.net * wks26(r.x) * 0.985, 0)), lmi = W.per.reduce((a, r) => a + (r.x.mi || 0), 0);
  const loads = ownerLoads(o.id).filter(l => (l.active && perm.loads) || (!l.active && perm.completed)).filter(l => l.st !== 'Cancelled');
  const hidden = PERMS.filter(([k]) => !perm[k]).map(([, l]) => l.replace('View ', '').replace(/^./, ch => ch.toUpperCase()));
  const R = {n:o.name, ini:oIni(o), k: o.cat === 'op' ? 'brand' : 'teal', uini:user[1], uname:user[0], scope:'Only what ' + short + ' owns', preview: !!opPreview,
    exit:() => c.set({screen:'owner', ownerId:o.id, previewOwner:null, otab:'acc'}),
    tabs:tabs.map(([k, l]) => ({l, on: k === tab ? 'on' : '', go:() => c.set({ptab:k})})),
    t:{ov: tab === 'ov', eq: tab === 'eq', loads: tab === 'loads', stmt: tab === 'stmt', exp: tab === 'exp', mt: tab === 'mt', docs: tab === 'docs'},
    hello:'Good morning, ' + first, sub:o.name + ' · ' + trucks.length + (trucks.length === 1 ? ' truck' : ' trucks') + (trailers.length ? ' and ' + trailers.length + ' trailers' : '') + (rent ? ' rented to' : ' leased to') + ' Lone Star Freight · Friday, Nov 13',
    showNext: !!perm.statements, next:{t:'Statement · Nov 2–8', v:fm2(W.net), d:(STMT_ST[o.id] || ['In review'])[0] + ' · pays Fri Nov 14'},
    kpis:[perm.statements ? {label:'Paid to you · 2026 so far', value:fm(ytd), suffix:'', sub:Math.max(...W.per.map(r => wks26(r.x))) + ' weekly statements', k:'ok', sk:'mu'} : null,
      perm.statements ? {label: rent ? 'Rental this week' : 'You earned · Nov 2–8', value:fm(W.gross), suffix:'', sub: rent ? n0f(lmi) + ' mi × $0.30 plus trailer weeks' : 'Before your costs', k:'brand', sk:'mu'} : null,
      perm.performance || perm.loads ? {label:'Miles on your trucks · Nov 2–8', value:n0f(lmi), suffix:' mi', sub:W.per.reduce((a, r) => a + (r.x.loads || 0), 0) + ' loads delivered', k:'info', sk:'mu'} : null,
      perm.equipment ? {label:'Trucks moving now', value:String(moving), suffix:' of ' + trucks.length, sub: trucks.length - moving ? (trucks.length - moving) + ' parked or waiting' : 'All on the road', k:'teal', sk:'mu'} : null].filter(Boolean),
    hiddenN: hidden.length ? 'Not shared with you: ' + hidden.join(', ') + '. Ask Lone Star if you need them.' : '',
    units: perm.equipment ? all.map(x => ({u:x.u, ymm:x.year + ' ' + x.make + ' ' + x.model, kind: x.kind === 'truck' ? 'Truck' : x.ttype, s:x.status, sk:x.sk,
      now: perm.locations ? x.loc : 'Location not shared', det: perm.locations ? x.fresh : '', drv: x.kind === 'truck' ? (perm.drivers ? (x.co ? x.driver + ' & ' + x.co : x.driver) + ' · ' + (x.works === 'owner' ? 'you' : (x.works === 'company' ? 'Lone Star’s driver' : 'your driver')) : 'Driver details not shared') : 'Pulled by any Lone Star truck',
      wk: x.kind === 'truck' ? (x.loads || 0) + ' loads · ' + n0f(x.mi || 0) + ' mi this week' : '$425 a week', svc:x.next})) : [],
    ucls: all.length > 4 ? 'n6' : 'n4', showMap: !!(perm.locations && perm.equipment), map: perm.locations ? ownerMap(X, all.filter(x => x.kind === 'truck')) : null,
    now:trucks.map(x => ({u:x.u, s:x.status, sk:x.sk, lane: x.lane ? x.load + ' · ' + x.lane : 'No load right now', loc:x.loc, fresh:x.fresh, fk:LOC_K(x.fk), d: perm.drivers ? (x.co ? x.driver + ' & ' + x.co : x.driver) : ''})),
    foot:'You see only what ' + short + ' owns. Lone Star’s other trucks, its customers and other owners are never shown here.'};
  // equipment
  R.eq = {cols:'76px 92px 52px 112px 136px 172px 92px 120px' + (perm.locations ? ' 176px' : '') + (perm.drivers ? ' 170px' : '') + ' 168px', fz:'fz1',
    head:[H('Unit'),H('Type'),H('Year'),H('Make'),H('Model'),H('VIN'),H('Plate'),H('Status')].concat(perm.locations ? [H('Location')] : []).concat(perm.drivers ? [H('Driver')] : []).concat([H('Next service')]),
    rows:all.map(x => ({open:noop, cells:[T.tx(x.u, '', 'mono w5'), T.tx(x.kind === 'truck' ? 'Truck' : x.ttype, '', 't2'), T.tx(String(x.year), '', 'num'), T.tx(x.make), T.tx(x.model), T.tx(x.vin, '', 'mono fs12 t2'), T.tx(x.plate, '', 'mono fs12'), T.b(x.status, x.sk)]
      .concat(perm.locations ? [T.tx(x.loc, x.fresh, '', LOC_K(x.fk))] : []).concat(perm.drivers ? [x.driver ? T.tx(x.co ? x.driver + ' & ' + x.co.split(' ')[0] : x.driver) : mu('')] : []).concat([T.tx(x.next, '', 't2')])}))};
  // loads: no customer names, ever
  R.lt = {cols:'92px 72px 72px 72px 140px 150px 120px 88px' + (perm.statements ? ' 112px 120px' : ''), fz:'fz1',
    head:[H('Load'),H('Truck'),H('Pickup'),H('Delivery'),H('Origin'),H('Destination'),H('Status'),H('Miles',1)].concat(perm.statements ? [H('Revenue',1),H(rent ? 'Your rental' : 'Your share',1)] : []),
    rows:loads.map(l => ({open:noop, cells:[T.tx(l.id, '', 'mono fs12 w5'), T.tx(l.u, '', 'mono fs12 t2'), T.tx(l.pu, '', 'num t2'), T.tx(l.del, '', 'num t2'), T.tx(l.o), T.tx(l.dst), T.b(l.st, l.sk), T.n(n0f(l.mi))]
      .concat(perm.statements ? [T.m(rent ? '—' : fm2(l.rev), '', rent ? 'mu' : ''), T.m(fm2(shareOf(U5[l.u], l)), '', 'w6')] : [])}))};
  R.ltNote = rent ? 'Rental is paid on every mile driven, loaded or empty, so load rates aren’t shown. Customer names are never shown.' : 'Revenue is line haul, fuel surcharge and accessorials. Customer names are removed; each load’s rated freight bill is attached to your statement.';
  // statements
  R.sum = [{l: rent ? 'Rental earned' : 'You earned', v:fm2(W.gross), s: rent ? 'Trucks by the mile, trailers by the week' : 'Your share of ' + fm2(W.rev) + ' in load revenue'}, {l:'Your costs', v:fm2(W.ded), s: W.drvPayRun ? 'Includes your drivers’ pay, ' + fm2(W.drvPayRun) : 'Fuel, insurance, repairs, escrow'}, {l:'Paid to you', v:fm2(W.net), s:'Fri Nov 14 by ACH'}];
  R.sl = W.per.map(({x, m}) => ({u:x.u, d: x.kind === 'truck' ? (x.terms === 'rent' ? n0f(x.mi) + ' mi × $0.30' : x.loads + ' loads · ' + TERMS[x.terms].s.split(';')[0]) : 'Trailer · $425 a week', g:fm2(m.gross), c:fm2(m.ded), n:fm2(m.net)}));
  R.past = [['Oct 26 – Nov 1','Paid Nov 7',0.97],['Oct 19–25','Paid Oct 31',1.04],['Oct 12–18','Paid Oct 24',0.92],['Oct 5–11','Paid Oct 17',1.01]].map(([p, d, f]) => ({p, d, v:fm2(W.net * f)}));
  R.canDl = !!perm.download;
  // fuel and expenses
  const ftx = perm.fuel ? all.flatMap(fuelTx).filter(f => f.by === 'owner') : [];
  R.ft = {cols:'64px 72px 130px 110px 52px 80px 92px 104px', fz:'fz1', head:[H('Date'),H('Truck'),H('Truck stop'),H('City'),H('State'),H('Gallons',1),H('Price',1),H('Amount',1)],
    rows:ftx.map(f => ({open:noop, cells:[T.tx(f.date, '', 'num t2'), T.tx(f.u, '', 'mono fs12'), T.tx(f.stop), T.tx(f.city), T.tx(f.state, '', 'mono fs12 t2'), T.n(f.gal), T.m(f.ppg, '', 't2'), T.m(fm2(f.amt))]}))};
  R.hasFuel = ftx.length > 0; R.noFuel = !perm.fuel ? 'Fuel purchases aren’t shared with you.' : (ftx.length ? '' : 'Lone Star buys fuel for your trucks, so none is charged to you.');
  R.exp = perm.expenses ? W.per.flatMap(({x, m}) => m.dlines.filter(d => d[0] !== 'Fuel').map(([t, d, v]) => ({t:x.u + ' · ' + t, d: d || '', v:fm2(v)}))) : [];
  R.hasExp = perm.expenses;
  // maintenance and documents
  R.mt = {cols:'84px 76px 72px 250px 220px 112px 104px', fz:'fz1', head:[H('Work order'),H('Unit'),H('Date'),H('Work'),H('Shop'),H('Status'),H('Your cost',1)],
    rows:MAINT5.filter(r => all.some(x => x.u === r[1])).map(([wo, u, d, w, shop, st, k, cost, by]) => ({open:noop, cells:[T.tx(wo, '', 'mono fs12 w5'), T.tx(u, '', 'mono fs12'), T.tx(d, '', 'num t2'), T.tx(w), T.tx(shop, '', 't2'), T.b(st, k), T.m(by === 'owner' && cost ? fm2(cost) : (by === 'owner' ? '—' : 'Lone Star pays'), '', by === 'owner' && cost ? '' : 'mu')]}))};
  R.dt = {cols:'320px 110px 92px 120px 150px 120px', fz:'fz1', head:[H('Document'),H('Type'),H('Unit'),H('Expires'),H('Status'),H('')],
    rows:docsOf(o).filter(d => d.portal).map(d => ({open:noop, cells:[T.tx(d.t, '', 'w5'), T.tx(d.ty, '', 't2'), T.tx(d.u, '', 't2'), T.tx(d.exp, '', 't2'), T.b(d.st, d.k), perm.download ? acts([['Download', noop]]) : mu('View only')]}))};
  return R;
}

// ---------------------------------------------------------------- the console
// One confirmation toast at a time, whichever render's handler raised it.
let toastTimer;
/** Stops the toast timer; called when the console unmounts. */
export function stopTimers() { clearTimeout(toastTimer); }

export class ConsoleLogic {
  /** Inputs that don't change by interaction: the route, the signed-in role and the look. Set by the provider. */
  props = {};
  /** Interface state. The provider owns it and hands the current value in before each render. */
  state = {};
  /** Set by the provider: receives every state change (an object, or a function of the previous state). */
  onState = null;
  setState(update) { if (this.onState) this.onState(update); }
  set = patch => this.setState(patch);
  go = k => this.setState({screen:k, drawer:null, overlay:'none', panel:'none', modal:'none', lsel:[], lsort:null, dd:null, ltab:0, lq:''});
  open = id => this.setState({screen:'loads', drawer:id, overlay:'none', modal:'none'});
  loadPage = id => this.setState({screen:'load', loadId:id, drawer:null, overlay:'none', modal:'none'});
  assign = () => this.setState({screen:'dispatch', panel:'assign', drawer:null, overlay:'none', modal:'none'});
  driver = n => this.setState({screen:'driver', driverName:n, drawer:null, overlay:'none', modal:'none'});
  setSel = s => this.setState({sel:s});
  add = k => k === 'owner' ? this.ownerForm('new') : this.setState({modal:'add', kind:k, mstep: k === 'mileage' ? 'manual' : 'choose', overlay:'none', dd:null, ddq:''});
  owner = id => this.setState({screen:'owner', ownerId:id, previewOwner:null, otab:'ov', otruck:'', oload:0, drawer:null, overlay:'none', modal:'none', dd:null});
  ownerForm = (mode, id) => this.setState({screen:'ownerform', ofMode:mode, ofId:id || null, ofExtra:0, drawer:null, overlay:'none', modal:'none', dd:null});
  truck = u => this.setState({screen:'truck', truckId:u, drawer:null, overlay:'none', modal:'none', dd:null});
  stmt = id => this.setState({screen:'stmt', stmtId:id, drawer:null, overlay:'none', modal:'none', dd:null});
  ltab = i => this.setState({ltab:i, lsel:[]});
  lq = q => this.setState({lq:q});
  imp = k => this.setState({modal:'import', kind:k, mstep:'upload', overlay:'none'});
  mgo = st => this.setState({mstep:st, dd:null, ddq:''});
  closeModal = () => this.setState({modal:'none'});
  created = k => { this.setState({modal:'none', toast:(ADD[k] || ADD.driver).done}); clearTimeout(toastTimer); toastTimer = setTimeout(() => this.setState({toast:null}), 5000); };
  inspect = () => this.setState({modal:'add', kind:'inspection', mstep:'review', overlay:'none'});
  receipt = () => this.setState({modal:'add', kind:'fuel', mstep:'review', overlay:'none'});
  preview = t => this.setState({preview:t, screen:'dispatch', drawer:null, overlay:'none', panel:'none', modal:'none'});
  hover = key => this.setState({hv:key});
  tview = (card, on) => this.setState({tv:{...(this.state.tv || {}), [card]:on}});
  ddToggle = id => this.setState({dd:id, ddq:''});
  ddPick = (id, v) => this.setState({fv:{...(this.state.fv || {}), [id]:v}, dd:null, ddq:''});
  ddQ = q => this.setState({ddq:q});
  setField = (id, v) => this.setState({fv:{...(this.state.fv || {}), [id]:v}});
  lselSet = keys => this.setState({lsel:keys});
  lsortSet = srt => this.setState({lsort:srt});
  setFtab = i => this.setState({ftab:i});
  renderVals() {
    const p = this.props, s = this.state;
    this.uid = 'ff';
    const pv = s.preview || null;
    const roleKey = pv ? 'dispatcher' : ((p.role && p.role !== 'auto' && ROLES[p.role]) ? p.role : (p.financeAccess === false ? 'dispatcher' : 'ops'));
    const R = ROLES[roleKey];
    const fin = R.fin;
    let screen = s.screen || p.screen || 'dashboard';
    if (screen.indexOf('platform') === 0) screen = 'platform';
    if (roleKey === 'eqowner' || (s.previewOwner && s.screen === 'ownerportal')) screen = 'ownerportal';
    if (screen === 'equipment') screen = 'trucks';
    this.curScreen = screen;
    const teamKey = pv || (roleKey === 'dispatcher' && TEAMS[p.team] ? p.team : null);
    const team = teamKey ? TEAMS[teamKey] : null;
    const overlay = s.overlay !== undefined ? s.overlay : (p.overlay || 'none');
    const panel = s.panel !== undefined ? s.panel : (p.panel || 'none');
    const drawerId = s.drawer !== undefined ? s.drawer : (p.drawer || null);
    const sel = s.sel || (p.preselect ? ['FF-24851','FF-24862','FF-24833'] : []);
    const step = s.step || p.step || 'org';
    const modal = s.modal !== undefined ? s.modal : (p.modal || 'none');
    const kind = s.kind || p.kind || 'driver';
    const mstep = s.mstep || p.modalStep || (modal === 'import' ? 'upload' : 'choose');
    const mini = s.sbMini !== undefined ? s.sbMini : p.sidebar === 'collapsed';
    const c = {go:this.go, open:this.open, loadPage:this.loadPage, assign:this.assign, driver:this.driver, set:this.set, setSel:this.setSel,
      add:this.add, imp:this.imp, mgo:this.mgo, closeModal:this.closeModal, created:this.created, hover:this.hover, tview:this.tview, inspect:this.inspect, receipt:this.receipt, preview:this.preview,
      owner:this.owner, ownerForm:this.ownerForm, truck:this.truck, stmt:this.stmt, ltab:this.ltab, lq:this.lq, ddToggle:this.ddToggle, ddPick:this.ddPick, ddQ:this.ddQ, setField:this.setField, lsel:this.lselSet, lsort:this.lsortSet, setFtab:this.setFtab};
    const user = {ini:R.ini, name:R.who, role:R.label, email:R.email};
    const X = {fin, R, roleKey, c, user, panel, sel, drawerId, tab: s.tab || 0, loadId: s.loadId || p.loadId || 'FF-24817', driverName: s.driverName || 'Marcus Bell', screen, step,
      modal, kind, mstep, hv: s.hv || null, tv: s.tv || {}, team,
      fv:{...(p.preset === 'other' ? PRESET_OTHER : {}), ...(s.fv || {})}, ddOpen: s.dd !== undefined ? s.dd : (p.ddOpen || null), ddq: s.ddq || '',
      ownerId: s.previewOwner || s.ownerId || p.ownerId || 'CT', opPreview: !!s.previewOwner && roleKey !== 'eqowner',
      otab: s.otab || p.ownerTab || 'ov', orange: s.orange || p.ownerRange || 'wk', otruck: s.otruck !== undefined ? s.otruck : (p.ownerUnit || ''), oload: s.oload !== undefined ? s.oload : 0, ptab: s.ptab || p.portalTab || 'ov',
      ofMode: s.ofMode || p.ownerForm || 'new', ofId: s.ofId || (p.ownerForm === 'edit' ? p.ownerId || 'CT' : null), ofPreset: s.ofMode ? '' : (p.ownerFormPreset || ''), ofExtra: s.ofExtra || 0,
      truckId: s.truckId || p.truckId || 'T-1102', stmtId: s.stmtId || p.stmtId || 'TR', ltab: s.ltab !== undefined ? s.ltab : (+p.listTab || 0), lq: s.lq || '',
      lsel: s.lsel || (p.listSel ? String(p.listSel).split(',') : []), lsort: s.lsort || null, rpt: s.rpt || p.report || 'ontime',
      ftab: s.ftab !== undefined ? s.ftab : Math.max(0, ['purchases','mileage','returns','rates'].indexOf(p.fuelTab || 'purchases'))};

    const surface = ['signin','portal','states','ownerportal'].includes(screen);
    const mod = MODULE_OF[screen] || screen;
    const forbidden = !surface && R.deny.includes(mod);
    const activeNav = mod;
    const navSrc = roleKey === 'platform' ? PNAV : NAV;
    const nav = navSrc.map(g => ({label:g.label, items:g.items.map(([key, label, icon, count, hot]) => {
      const locked = R.deny.includes(key);
      const active = key === activeNav;
      return {label, d:I[icon], count: locked ? '' : (count || ''), hot: hot ? 'hot' : '', locked, cls: active ? 'on' : (locked ? 'lock' : ''), cur: active ? 'page' : undefined, go:() => this.go(key),
        aria: label + (count && !locked ? ', ' + count : '') + (locked ? ', no access' : ''), tip: mini ? label : ''};
    })}));

    const show = k => !forbidden && screen === k;
    const out = {
      I, uid:this.uid, frameH: p.frameH ? String(p.frameH) : '900', theme: p.theme === 'dark' ? 'dark' : 'light', density: p.density === 'comfortable' ? 'comfortable' : 'compact',
      fin, noFin: !fin, user, nav,
      sbCls: mini ? 'mini' : '', sbLabel: mini ? 'Expand sidebar' : 'Collapse sidebar', sbIcon: mini ? I.panelR : I.panel, sbExp: mini ? 'false' : 'true', toggleSb:() => this.setState({sbMini:!mini}),
      isCreate: !surface && overlay === 'create', isAcct: !surface && overlay === 'account', isMenu: !surface && (overlay === 'create' || overlay === 'account'),
      acctOn: overlay === 'account' ? 'on' : '', createExp: overlay === 'create' ? 'true' : 'false', acctExp: overlay === 'account' ? 'true' : 'false',
      toggleCreate:() => this.setState({overlay: overlay === 'create' ? 'none' : 'create'}), toggleAcct:() => this.setState({overlay: overlay === 'account' ? 'none' : 'account'}),
      hasModal: !surface && modal !== 'none' && !R.deny.includes((ADD[kind] || ADD.driver).mod), closeModal:this.closeModal,
      hasToast: !surface && !!s.toast, toast: s.toast || '', closeToast:() => this.setState({toast:null}),
      org: roleKey === 'platform' ? {name:'FlyFleet Platform', sub:'3 tenants · support desk', ini:'FF', c:'#8DA9FB'} : {name:'Lone Star Freight', sub:'MC 884213 · 42 drivers', ini:'LS', c:'#E8A317'},
      isConsole: !surface, isSignin: screen === 'signin', isPortal: screen === 'portal', isStates: screen === 'states',
      isForbidden: forbidden,
      isDash: show('dashboard'), isDispatch: show('dispatch'), isLoads: show('loads'), isLoad: show('load'), isNew: show('newload'),
      isTracking: show('tracking'), isList: !forbidden && LIST_SCREENS.includes(screen), isDriver: show('driver'), isSafety: show('safety'),
      isDocReview: show('docreview'), isMaint: show('maintenance'), isReports: show('reports'), isTeam: show('team'), isTeams: show('teams'), isFuel: show('fuel'), isOwner: show('owner'), isOPortal: screen === 'ownerportal', isOForm: show('ownerform'), isStmt: show('stmt'), isTruck: show('truck'),
      SC: team ? {on:true, label:team.name + ' · ' + team.trucks.length + ' trucks', tip:'You see only ' + team.name + '’s trucks and the loads, drivers and alerts on them', preview: !!pv} : {on:false, label:'', tip:'', preview:false},
      exitPreview:() => this.setState({preview:null, screen:'teams', drawer:null, overlay:'none', panel:'none', modal:'none'}), goReports:() => this.go('reports'),
      isSettings: show('settings') || show('policy'), isPolicy: show('policy'), isInteg: show('settings'), isMessages: show('messages'),
      isPalette: !surface && overlay === 'palette', isNotif: !surface && overlay === 'notifications', isAI: !surface && overlay === 'ai',
      aiOn: overlay === 'ai' ? 'on' : '', notifOn: overlay === 'notifications' ? 'on' : '',
      hasDrawer: false,
      goNew:() => this.add('load'), goAlerts:() => this.go('alerts'), goLoads:() => this.go('loads'), goTracking:() => this.go('tracking'),
      goMessages:() => this.go('messages'), goDocs:() => this.go('documents'), goDrivers:() => this.go('drivers'), goDispatch:() => this.go('dispatch'),
      goDash:() => this.go('dashboard'), goAudit:() => this.go('audit'), goFuel:() => this.go('fuel'), goOwners:() => this.go('owners'), goReview:() => this.go('docreview'), goSignin:() => this.setState({screen:'signin', step:'signin', overlay:'none', modal:'none'}),
      openPalette:() => this.setState({overlay:'palette'}), toggleAI:() => this.setState({overlay: overlay === 'ai' ? 'none' : 'ai'}),
      toggleNotif:() => this.setState({overlay: overlay === 'notifications' ? 'none' : 'notifications'}), closeOverlay:() => this.setState({overlay:'none'}),
      closePanel:() => this.setState({panel:'none'}), closeDrawer:() => this.setState({drawer:null}),
      toggleAll:() => this.setSel(sel.length ? [] : LOADS.slice(0, 14).map(l => l.id)), clearSel:() => this.setSel([]),
    };
    if (forbidden) out.FB = {mod: LABEL_OF[mod] || mod, perm: PERM[mod] || mod + '.read'};
    if (out.isDash) out.D = buildDash(X);
    if (out.isDash && out.D.biz) out.BZ = buildBiz(X);
    if (out.isCreate) out.CR = CREATE.filter(x => !R.deny.includes(x[4])).map(([k, t, sub, ic]) => ({t, s:sub, ic:I[ic], go:() => this.add(k)}));
    if (out.isAcct) out.ACCT = [['Profile & preferences','user',''],['Notification settings','bell',''],['Keyboard shortcuts','kbd','?'],['Help & support','help','']].map(([t, ic, kbd]) => ({t, ic:I[ic], kbd}));
    if (out.hasModal) out.MD = buildModal(X);
    if (out.isDispatch) Object.assign(out, buildBoard(X));
    if (out.isLoads) { const r = buildLoads(X); out.LT = r.LT; out.DL = r.DL || {}; out.hasDrawer = !!r.DL; }
    if (out.isLoad) out.LP = buildLoadPage(X);
    if (out.isNew) out.NL = {steps:[['Customer & references','Owens Corning · PO 88213','done'],['Load basics','53’ dry van · 42,000 lb','done'],['Stops & appointments','2 stops','cur'],['Rate & charges','Line haul, fuel, accessorials',''],['Documents & notes','Rate confirmation, instructions',''],['Review','Check and save','']]
      .map(([l, d, st], i) => ({l, d, st, n:String(i + 1), done: st === 'done' ? 1 : 0, todo: st === 'done' ? 0 : 1}))};
    if (out.isTracking || out.isPolicy || out.isMessages) out.M = buildMap(X);
    if (out.isList) { out.L = buildList(screen, X); if (out.L && out.L.callout && !out.L.callout.ic) out.L.callout.ic = I.info; if (out.L) { out.L.head = out.L.head.map(h => h.srt ? h : {...h, nogo:true}); out.L.tsc = 'tscroll' + (out.L.scroll ? ' on ' + (out.L.fz || '') : ''); out.L.qv = out.L.qv || ''; } }
    if (out.isDriver) out.DP = buildDriver(X);
    if (out.isSafety) out.SF = buildSafety(X);
    if (out.isDocReview) out.DR = buildDocReview();
    if (out.isMaint) out.MT = buildMaint(X);
    if (out.isReports) out.RP = buildReports(X);
    if (out.isTeam) out.TM = buildTeam();
    if (out.isTeams) out.DT = buildTeams(X);
    if (out.isTeam || out.isTeams) out.TT = [['Members','17',noop],['Roles & permissions','8',() => this.go('team')],['Dispatch teams','2',() => this.go('teams')],['Invitations','2',noop]]
      .map(([l, n, go], i) => ({l, n, go, on: (screen === 'teams' ? i === 2 : i === 1) ? 'on' : ''}));
    if (out.isFuel) out.FU = buildFuel(X);
    if (out.isOwner) out.OW = buildOwner5(X);
    if (out.isOPortal) out.OP = buildOwnerPortal5(X);
    if (out.isOForm) out.OF = buildOwnerForm(X);
    if (out.isStmt) out.SM = buildStmt(X);
    if (out.isTruck) out.TK = buildTruck(X);
    if (out.isSettings) Object.assign(out, buildSettings(X));
    if (out.isMessages) out.MS = buildMessages(X);
    if (out.isPalette) out.PL = buildPalette(X);
    if (out.isNotif) out.NT = buildNotif(X);
    if (out.isAI) out.AI = buildAI(X);
    if (out.isSignin) out.AU = buildAuth(X);
    if (out.isPortal) out.PT = buildPortal();
    if (out.isStates) out.ST2 = {sk:['62%','48%','70%','55%','66%']};
    return out;
  }
}

export { ROLES, TEAMS, LOADS, DRIVERS, TRUCKS, OWN5, U5, PERM, MODULE_OF, LIST_SCREENS };
