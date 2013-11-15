/* POI Demo 3 modified for Component POI data */

/* Local POI database indexed by UUID */

var miwi_poi_pois = {}; // ["UUID": {<POI data>},...]
var miwi_poi_xml3d_models = {}; // ["UUID": {<xml3d data>},...]
var miwi_poi_xml3d_requests = {}; // ["UUID": {lon: <lon>, 
                                  // lat: <lat>},...]
var miwi_poi_xhr = null; // http request
var miwi_3d_xhr = null; // http request

/**/

/*  str2html - convert any string for safe display in html
    ========
   
    This converts characters not allowed in html strings to well behaving
    html character entities.           
    
    str2html(rawstr: string): string;
        rawstr - string not controlled for contents
        
        *result - safe, well behaving html representation of the input string
        
    Example: "Rat & Arms" -> "Rat &amp; Arms"    
*/        
        
var str2html_table = {
	"<": "&lt;",
	"&": "&amp;",
	"\"": "&quot;",
	"'": "&apos;",
	">": "&gt;",
};

function str2html (rawstr) {
	var result = "";
	for (var i = 0; i < rawstr.length; i++) {
		result = result + (str2html_table[rawstr[i]] ? 
				(str2html_table[rawstr[i]]) : (rawstr[i]));
	}
	return result;
}
/**/

(function ( namespace ) {
    var log = wex.Util.log, map, geocoder, homeMarker, positionMarker, 
        poiWindow,
        poiStorage = {},
        markers = [],
        oldSearchPoints = {},
        queries = {},
        queryID = 0, //Running number to identify POI search areas, and to 
                     //track search success
        webSocket_POI = null,
        webSocket_3D = null,
        centerChangedTimeout,
        oldMapCenter,
        CENTER_CHANGED_THRESHOLD = 130,
//        BACKEND_ADDRESS_POI = "http://130.231.12.82:8080/"
        BACKEND_ADDRESS_POI = "http://chiru.cie.fi:8080/",
//        BACKEND_ADDRESS_3D = "http://130.231.12.82:8085/",
        BACKEND_ADDRESS_3D = "http://chiru.cie.fi:8085/",

        searchRadius = 600;
        searchRadiusScaling = 2.0;

    window.WebSocket = (window.WebSocket || window.MozWebSocket);

    /*function loadScript() {
     var script = document.createElement( "script" );
     script.type = "text/javascript";
     script.src = "https://maps.googleapis.com/maps/api/js?v=3.exp&" + 
            "sensor=true&callback=demo4.initialize";
     document.body.appendChild( script );

     log( "Loading Google Maps API V3." );

     }*/

    // This function is called by Google API when it has been loaded
    // Initialises the demo
    namespace.initialize = function () {
        log( "Initialising the demo." );

        document.querySelector( '#button1' ).onclick = locate;
        document.querySelector( '#button2' ).onclick = codeAddress;
 //       document.querySelector( '#button4' ).onclick = updateMap;

        geocoder = new google.maps.Geocoder();

        var mapOptions = {
            zoom: 16,
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            center: new google.maps.LatLng( 65.0610432, 25.468170099999952 ) 
                //Initial location Oulu University
        };

        map = new google.maps.Map( document.getElementById( 'map-canvas' ),
            mapOptions );

        homeMarker = new google.maps.Marker( {
            icon: "http://chart.apis.google.com/chart?chst=d_map_pin_icon&" + 
                "chld=home|FEFE00",
            title: "Current position"
        } );

        positionMarker = new google.maps.Marker( {
            icon: "http://chart.apis.google.com/chart?chst=d_map_pin_letter&" + 
                "chld=L|00FFFF",
            title: "Found location"
        } );

        poiWindow = new google.maps.InfoWindow( {
            content: '<div class="infoTitle">DefaultName</div>' +
                '<div class="infoText">' +
                "<p>Category: DefaultCategory </p>" +
                '</div>'
        } );

        oldMapCenter = map.getCenter();

        google.maps.event.addListener( map, 'zoom_changed', function () {
            var zoomLevel = map.getZoom();

            if ( zoomLevel <= 10 ) {
                searchRadius = 5000;
            } else if ( zoomLevel <= 14 && zoomLevel > 10 ) {
                searchRadius = 5000 + (10 - zoomLevel) * 1000;
            } else if ( zoomLevel > 5 && zoomLevel < 20 ) {
                searchRadius = 1000 - (zoomLevel - 10) * 100;
            } else if ( zoomLevel >= 20 ) {
                searchRadius = 50;
            }
            searchRadius *= searchRadiusScaling; // Scaling factor
            console.log( "Zoom level: " + zoomLevel + " Search radius: " + 
                    searchRadius );
        } );

        google.maps.event.addListener( map, 'center_changed', function () {
            var mapCenter = map.getCenter(), dist, minDist = Infinity, i, len,
                searchPoints = oldSearchPoints[searchRadius + ''];

            //TODO: Experimental feature. Reducing amount of queries to backend.
            // (wip)
            dist = distHaversine( mapCenter, oldMapCenter );
            //console.log(dist)

            // Center has to move enough before looking through old search 
            // points. Reduces processing amount.
            if ( dist > CENTER_CHANGED_THRESHOLD ) {
                //console.log("Map center moved above threshold. Dist:", dist, 
                // "meters.");

                // Now we check if the new search point is far enough from old 
                // query points.
                if ( searchPoints ) {
                    len = searchPoints.length;

                    for ( i = len; i--; ) {
                        dist = distHaversine( mapCenter, 
                                searchPoints[i]['center'] );
                        //console.log(dist);
                        if ( dist < minDist ) {
                            minDist = dist;
                        }

                    }

                    if ( minDist <= searchRadius * 0.8 ) {
                        return;
                    }
                    console.log( "No old query points near. Threshold:", 
                            searchRadius, "meters. Min dist:", minDist );
                }

                // Initiate new search after small timeout, so the search is 
                // not constantly triggered while moving the map
                clearTimeout( centerChangedTimeout );
                centerChangedTimeout = window.setTimeout( 
                        function ( lat, lng ) { searchPOIs( lat, lng );
                }, 800, mapCenter.lat(), mapCenter.lng() );

                oldMapCenter = mapCenter;

            }
        } );

        // HTML5 Geolocation
        locate();
        searchPOIs();

    };

    function rad( x ) {
        return x * Math.PI / 180;
    }

    // Distance between two points on a sphere
    function distHaversine( p1, p2 ) {
        var R, dLat, dLong, a, c;

        R = 6378137; // earth's mean radius in m
        dLat = rad( p2.lat() - p1.lat() );
        dLong = rad( p2.lng() - p1.lng() );

        a = Math.sin( dLat / 2 ) * Math.sin( dLat / 2 ) +
            Math.cos( rad( p1.lat() ) ) * Math.cos( rad( p2.lat() ) ) * 
            Math.sin( dLong / 2 ) * Math.sin( dLong / 2 );
        c = 2 * Math.atan2( Math.sqrt( a ), Math.sqrt( 1 - a ) );

        return R * c;
    }


    function parsePOIMsg( msg ) {
        var json = JSON.parse( msg );

        if ( json["Error"] ) {
            log( "Error: " + json["Error"]["msg"] + encodeURIComponent( 
                    json["Error"]["query"] ) );
        } else {
            parsePoiData( json );
        }
    }

    function searchPOIs( lat, lng ) {
        var center, searchPoint;
        var restQueryURL;

        if ( !lat || !lng ) {
            // center = map.getCenter();
            lat = 65.0167;
            lng = 25.4667;
        }

        searchRadius = 1000;

        console.log( "Doing search from " + BACKEND_ADDRESS_POI);
        console.log( "Map center: lat=" + lat + " lon=" + lng );
        restQueryURL = BACKEND_ADDRESS_POI + "radial_search?" +
           "lat=" + lat + "&lon=" + lng + "&query_id=" + queryID + "&radius=" +
            searchRadius + "&component=fw_core";
        console.log("restQueryURL: " + restQueryURL);
        miwi_poi_xhr = new XMLHttpRequest();
        
        miwi_poi_xhr.onreadystatechange = function () {
            if(miwi_poi_xhr.readyState === 4) {
                if(miwi_poi_xhr.status  === 200) { 
                    console.log( "succes: " + miwi_poi_xhr.responseText);
                    var json = JSON.parse(miwi_poi_xhr.responseText);
                    // parsePoiData(json);
                    console.log(json);
                }
                else if (miwi_poi_xhr.status === 404) { 
                    console.log("failed: " + miwi_poi_xhr.responseText);
                }
            }
        }

        miwi_poi_xhr.onerror = function (e) {
            log("failed to get POIs");
        };

        miwi_poi_xhr.open("GET", restQueryURL, true);
        miwi_poi_xhr.send();
        // searchPoint = new google.maps.LatLng( lat, lng );

/*  // Circle removed
        var circle = new google.maps.Circle( {
            strokeWeight: 1,
            fillColor: '#FF0000',
            fillOpacity: 0.10,
            radius: searchRadius,
            center: searchPoint,
            map: map
        } );
*/
        // if ( !oldSearchPoints.hasOwnProperty( searchRadius + '' ) ) {
        //     oldSearchPoints[searchRadius + ''] = [];
        // }

        // queries[queryID + ''] = {id: queryID, center: searchPoint, 
        //         radius: searchRadius, ready: false, debugShape: circle};
        // oldSearchPoints[searchRadius + ''].push( queries[queryID + ''] );

        // queryID++;

        // console.log( oldSearchPoints )

    }

    function findSearchPoint( id ) {
        //console.log( "searching spoint, id", id );
        if ( queries.hasOwnProperty( id + '' ) ) {
            return queries[id + ''];
        }

        return false;
    }

    function storePoi( uuid, poiData ) {
        if ( !poiStorage.hasOwnProperty( uuid ) ) {
            poiStorage[uuid] = poiData;
        }
    }

    function updateMarker( pos, marker ) {

        var markerOptions =
        {
            //zIndex: 200,
            optimized: false
        };

        marker.setMap( map );
        marker.setPosition( pos );
        marker.setOptions( markerOptions );
    }


    // Geolocation
    function locate() {
        if ( navigator.geolocation ) {
            console.log( "Getting current position..." );
            navigator.geolocation.getCurrentPosition( handleFoundLocation, 
                function () {
                    handleNoGeolocation( true );
                } );
        } else {
            // Browser doesn't support Geolocation
            handleNoGeolocation( false );
        }
    }

    function handleFoundLocation( position ) {
        var pos = new google.maps.LatLng( position.coords.latitude,
            position.coords.longitude );

        updateMarker( pos, homeMarker );
        // console.log(pos)
        map.setCenter( pos );

        console.log( "Location found." );
    }

    function handleNoGeolocation( errorFlag ) {
        if ( errorFlag ) {
            alert( 'Error: The Geolocation service failed.' );
        } else {
            alert( 'Error: Your browser doesn\'t support geolocation.' );
        }
        map.setCenter( new google.maps.LatLng( 65.0610432, 
                25.468170099999952 ) );
    }

    function codeAddress() {
        console.log( "Finding address/coordinate..." );

        var address = document.querySelector( '#address' ).value;
        geocoder.geocode( { 'address': address}, function ( results, status ) {
            if ( status === google.maps.GeocoderStatus.OK ) {
                map.setCenter( results[0].geometry.location );
                updateMarker( results[0].geometry.location, positionMarker );
                console.log( "Location found." );
            } else {
                alert( 'Geocode was not successful: ' + status );
            }
        } );
    }

    function parsePoiData( data ) {

        var counter = 0, jsonData, poiData, pos, i, uuid, pois,
            contents, locations, location, searchPoint, poiCore;

        if ( !data ) {
            return;
        }

        console.log( "Parsing POI data..." );

        if ( !data.hasOwnProperty( "pois" ) ) {
            log( "Error: Invalid POI data." );
            return;
        }

        pois = data['pois'];

        for ( uuid in pois ) {
            poiData = pois[uuid];
            poiCore = poiData.fw_core;
            console.log("poiCore=" + JSON.stringify(poiCore));
            if ( poiCore && poiCore.hasOwnProperty( "location" ) ) {
                location = poiCore['location'];

               if ( location['type'] === 'wsg84' ) {
                 pos = new google.maps.LatLng( location['latitude'], 
                        location['longitude'] );
                 miwi_poi_pois[uuid] = poiCore;
                 addPOI_UUID_ToMap( pos, poiCore, uuid );
                 counter++;
               }
            }

            //console.log( poiData );

            storePoi( uuid, poiCore );
        }

        if ( data.hasOwnProperty( "queryID" ) ) {
            searchPoint = findSearchPoint( data['queryID'] );
            searchPoint['debugShape'].setOptions( {fillColor: "#76EE00"} );
            searchPoint['ready'] = true;
        }

        console.log( "Ready." );
        console.log( counter + " pois added on the map." );

        console.log( poiStorage );
    }

    function findPOIs( pos, radius ) {
        var posString = pos.lat() + "," + pos.lng();

        //TODO: Find POIs from client POI storage using location and radius
    }


    function getPOI( uuid ) {
        if ( poiStorage.hasOwnProperty( uuid ) ) {
            return poiStorage[uuid];
        } else {
            return false;
        }
    }

    function POI_onClick(poiMarker, uuid) {
        var data, name, label, category, icon_string, description, url,
            thumbnail, found_label, found_thumbnail;
 
console.log("uuid: " + uuid);
        
        data = miwi_poi_pois[uuid] || {"label": "No information available"};
        name = data["name"] || "A Point of Interest";
        category = data["category"] || "";
        thumbnail = data["thumbnail"] || "";
        label = data["label"] || "";
        description = data["description"] || "";
        url = data["url"] || "";
        // Default icon is star !
        icon_string = miwi_poi_icon_strings[category] || "star";
        found_label = (label != "");
        found_thumbnail = (thumbnail != "");
        //map.setZoom(15);
        poiWindow.content = '<div id="infoTitle">' + str2html(name) + 
                ' &#32;</div>' +
                '<div id="infoText">' +
                ((found_thumbnail || found_label) ? "<p>" : "") + 
                  (found_thumbnail ? ('<img src="' + 
                      str2html(thumbnail) + '" height="120px"/>') : "") +
                  ((found_thumbnail && found_label) ? "<br/>" : "") + 
                  (found_label ? str2html(label) : "") +
                ((found_thumbnail || found_label) ? "</p>" : "") + 
                ((description != "") ? 
                    ("<p>" + str2html(description) + "</p>") : "") +
                ((url != "") ?
                    ("<p><a target=\"_blank\" href=\"" + str2html(url) + "\">" +
                    str2html(url) + "</a></p>") : "") +
                
                '</div>';
	
console.log(poiWindow.content);
        poiWindow.open( map, poiMarker );
        
        miwi_poi_xml3d_requests[uuid] = {lon: data.location.longitude, 
                lat: data.location.lat};
        restQueryURL = BACKEND_ADDRESS_3D + "get_pois?poi_id=" + uuid +
            "&query_id=" + queryID;
        
        console.log("3D restQueryURL: " + restQueryURL);
        miwi_3d_xhr = new XMLHttpRequest();
        
        miwi_3d_xhr.onreadystatechange = function () {
            if(miwi_3d_xhr.readyState === 4) {
                if(miwi_3d_xhr.status  === 200) { 
                    //console.log( "succes: " + xhr.responseText);
                    var json = JSON.parse(miwi_3d_xhr.responseText);
                    parse3DData(json);
                }
                else if (miwi_3d_xhr.status === 404) { 
                    log("failed: " + miwi_3d_xhr.responseText);
                }
            }
        }

        miwi_3d_xhr.onerror = function (e) {
            log("failed to get 3d");
        };

        miwi_3d_xhr.open("GET", restQueryURL, true);
        miwi_3d_xhr.send();

        queryID++;
        
    }


    function addPOI_UUID_ToMap_addListener(poiMarker, op, uuid) {
        /* Anonymous function declaration here creates a closure that binds
           the data in the call stack. An attempt is made to keep the amount of 
           data bound to the closure small.
        */
        google.maps.event.addListener( poiMarker, op, function () {
            POI_onClick(poiMarker, uuid);
        });
    }	
        
    function addPOI_UUID_ToMap( pos, data, uuid ) {
        var poiMarker, contents, content, i, len,
            name, label, category, icon_string, description;

        data = data || {};
        name = data["name"] || "N.N.";
        category = data["category"] || "Point of interest - maybe";
        // Default icon is star !
        icon_string = miwi_poi_icon_strings[category] || "star";
        poiMarker = new google.maps.Marker(
            {
                icon: (icon_string == "") ? ("http://" + 
	            "chart.apis.google.com/chart?chst=d_map_pin_letter&" + 
		        "chld=P|7CFF00|000000") : 
		        ("http://chart.apis.google.com/chart?chst=" + 
		        "d_map_pin_icon&chld=" + icon_string + 
		        "|7CFF00|000000"),
                title: category + ": " + name
            } );

        addPOI_UUID_ToMap_addListener(poiMarker, 'click', uuid);					

        updateMarker( pos, poiMarker );

    }
    
 
    function updateMap() {
        searchPOIs();
    }

    /* Handling of 3D data */
    /* =================== */
       
    function parse3DMsg( msg ) {
        var json = JSON.parse( msg );

        if ( json["Error"] ) {
            log( "Error: " + json["Error"]["msg"] + encodeURIComponent( 
                    json["Error"]["query"] ) );
        } else {
            parse3DData( json );
        }
    }

    function parse3DData( data ) {

        var counter = 0, jsonData, poiData, pos, i, uuid, pois,
            contents, locations, location, searchPoint, el;

        if ( !data ) {
            return;
        }

        console.log( "Parsing 3D data..." );
//        log("Response from server:\n" + JSON.stringify(data, null, "  "));
        el = document.getElementById( "log" );
                if ( el !== null ) {
                    el.innerHTML += "<br/><pre>" + 
                    str2html(JSON.stringify(data, null, "  ")) +
                    "</pre><br/>";
                    /*
                    for(var tag in el) {
                      console.log(tag);
                    }
                    */
                    var d = el.scrollHeight - el.clientHeight;
                    el.scrollTop = d;
//                    el.setAttribute("scrollTop",d);
                };
                

/*
        if ( !data.hasOwnProperty( "xml3d_models" ) ) {
            log( "Error: Invalid 3D data." );
            return;
        }

        data3d = data['xml3d_models'];
        console.log("data3d: " + JSON.stringify(data3d));
        for ( uuid in data3d ) {
            console.log("uuid: " + uuid);
            poi3DData = data3d[uuid];
            miwi_poi_xml3d_models[uuid] = poi3DData;
            if ( miwi_poi_xml3d_requests[uuid] ) {
                var req = miwi_poi_xml3d_requests[uuid];
                show3DOnMap(req.lon, req.lat, poi3DData);
            }
        }
*/
    }

    function show3DOnMap(lon, lat, poi3DData) {
        log("show3DOnMap: lon: " + lon + " lat: " + lat + 
            " poi3DData: " + JSON.stringify(poi3DData, null, "2"));
    }
    
    //window.onload = loadScript;
    searchPOIs(0,0);

}( window['demo4'] = window.demo4 || {} ));
