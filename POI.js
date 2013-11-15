/* -*- js-indent-level: 8 -*- */
/* globals window, console, document, THREEx, THREE, Stats, Detector, requestAnimationFrame */
/*
 * 	POIThreeJS
 * 	@author Tapani Jamsa
 * 	Date: 2013
 */

"use strict";

// MAIN

// standard global variables
var container, scene, camera, renderer, controls, stats;
var keyboard = new THREEx.KeyboardState();
var clock = new THREE.Clock();

var mouse = { x: 0, y: 0 }, INTERSECTED;

// custom global variables
var cube;
var projector, proj, mouse = {
		x: 0,
		y: 0
	}, INTERSECTED;
var sprite1;
var canvas1, context1, texture1;
var boxes = [];

// POI

var queryID = 0; //Running number to identify POI search areas, and to track search success
var miwi_poi_xhr = null; // http request

//        BACKEND_ADDRESS_POI = "http://130.231.12.82:8080/"
var BACKEND_ADDRESS_POI = "http://chiru.cie.fi:8080/";

var searchRadius = 600;

init();
animate();

// FUNCTIONS 		

function init() {
	// SCENE
	scene = new THREE.Scene();
	// CAMERA
	var SCREEN_WIDTH = window.innerWidth,
		SCREEN_HEIGHT = window.innerHeight;
	var VIEW_ANGLE = 45,
		ASPECT = SCREEN_WIDTH / SCREEN_HEIGHT,
		NEAR = 0.1,
		FAR = 20000;
	camera = new THREE.PerspectiveCamera(VIEW_ANGLE, ASPECT, NEAR, FAR);
	scene.add(camera);
	camera.position.set(0, 150, 400);
	camera.lookAt(scene.position);
	// RENDERER
	if (Detector.webgl)
		renderer = new THREE.WebGLRenderer({
			antialias: true
		});
	else
		renderer = new THREE.CanvasRenderer();
	renderer.setSize(SCREEN_WIDTH, SCREEN_HEIGHT);
	container = document.getElementById('ThreeJS');
	container.appendChild(renderer.domElement);
	// EVENTS
	THREEx.WindowResize(renderer, camera);
	THREEx.FullScreen.bindKey({
		charCode: 'm'.charCodeAt(0)
	});
	// CONTROLS
	controls = new THREE.OrbitControls(camera, renderer.domElement);
	// STATS
	stats = new Stats();
	stats.domElement.style.position = 'absolute';
	stats.domElement.style.bottom = '0px';
	stats.domElement.style.zIndex = 100;
	container.appendChild(stats.domElement);
	// LIGHT
	var light = new THREE.PointLight(0xffffff);
	light.position.set(0, 250, 0);
	scene.add(light);
	// FLOOR
	var floorTexture = new THREE.ImageUtils.loadTexture('images/checkerboard.jpg');
	floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
	floorTexture.repeat.set(100, 100);
	var floorMaterial = new THREE.MeshBasicMaterial({
		map: floorTexture,
		side: THREE.DoubleSide
	});
	var floorGeometry = new THREE.PlaneGeometry(10000, 10000, 10, 10);
	var floor = new THREE.Mesh(floorGeometry, floorMaterial);
	floor.position.y = -0.5;
	floor.rotation.x = Math.PI / 2;
	floor.name = "Checkerboard Floor";
	scene.add(floor);
	// SKYBOX/FOG
	var skyBoxGeometry = new THREE.CubeGeometry(10000, 10000, 10000);
	var skyBoxMaterial = new THREE.MeshBasicMaterial({
		color: 0x9999ff,
		side: THREE.BackSide
	});
	var skyBox = new THREE.Mesh(skyBoxGeometry, skyBoxMaterial);
	scene.add(skyBox);

	////////////
	// CUSTOM //
	////////////

	// initialize object to perform world/screen calculations
	proj = new THREE.Projector();

	// when the mouse moves, call the given function
	document.addEventListener( 'mousemove', onDocumentMouseMove, false );

	searchPOIs(0,0);
}

function onDocumentMouseMove( event ) 
{
	// the following line would stop any other event handler from firing
	// (such as the mouse's TrackballControls)
	// event.preventDefault();
	
	// update the mouse variable
	mouse.x = ( event.clientX / window.innerWidth ) * 2 - 1;
	mouse.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
}


function createBox(lat, lon, name) {
	var cubeGeometry = new THREE.CubeGeometry(10, 10, 10);
	var cubeMaterial = new THREE.MeshBasicMaterial( { color: 0x000088 } );
	cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
	cube.position.set(lat, 5, lon);
	cube.name = "Cube";
	scene.add(cube);
	boxes.push(cube);

	var spritey = makeTextSprite(name, {
		fontsize: 24,
		borderColor: {
			r: 255,
			g: 0,
			b: 0,
			a: 1.0
		},
		backgroundColor: {
			r: 255,
			g: 100,
			b: 100,
			a: 0.8
		}
	});
	spritey.position.set(lat, 30, lon);
	scene.add(spritey);

	// var spritey = makeTextSprite(description, {
	// 	fontsize: 32,
	// 	fontface: "Georgia",
	// 	borderColor: {
	// 		r: 0,
	// 		g: 0,
	// 		b: 255,
	// 		a: 1.0
	// 	}
	// });
	// spritey.position.set(55, 105, 55);
	// scene.add(spritey);

}

function makeTextSprite(message, parameters) {
	if (parameters === undefined) parameters = {};

	var fontface = parameters.hasOwnProperty("fontface") ?
		parameters["fontface"] : "Arial";

	var fontsize = parameters.hasOwnProperty("fontsize") ?
		parameters["fontsize"] : 18;

	var borderThickness = parameters.hasOwnProperty("borderThickness") ?
		parameters["borderThickness"] : 4;

	var borderColor = parameters.hasOwnProperty("borderColor") ?
		parameters["borderColor"] : {
		r: 0,
		g: 0,
		b: 0,
		a: 1.0
	};

	var backgroundColor = parameters.hasOwnProperty("backgroundColor") ?
		parameters["backgroundColor"] : {
		r: 255,
		g: 255,
		b: 255,
		a: 1.0
	};

	var spriteAlignment = THREE.SpriteAlignment.topLeft;

	var canvas = document.createElement('canvas');
	var context = canvas.getContext('2d');
	context.font = "Bold " + fontsize + "px " + fontface;

	// get size data (height depends only on font size)
	var metrics = context.measureText(message);
	var textWidth = metrics.width;

	// background color
	context.fillStyle = "rgba(" + backgroundColor.r + "," + backgroundColor.g + "," + backgroundColor.b + "," + backgroundColor.a + ")";
	// border color
	context.strokeStyle = "rgba(" + borderColor.r + "," + borderColor.g + "," + borderColor.b + "," + borderColor.a + ")";

	context.lineWidth = borderThickness;
	roundRect(context, borderThickness / 2, borderThickness / 2, textWidth + borderThickness, fontsize * 1.4 + borderThickness, 6);
	// 1.4 is extra height factor for text below baseline: g,j,p,q.

	// text color
	context.fillStyle = "rgba(0, 0, 0, 1.0)";

	context.fillText(message, borderThickness, fontsize + borderThickness);

	// canvas contents will be used for a texture
	var texture = new THREE.Texture(canvas)
	texture.needsUpdate = true;

	var spriteMaterial = new THREE.SpriteMaterial({
		map: texture,
		useScreenCoordinates: false,
		alignment: spriteAlignment
	});
	var sprite = new THREE.Sprite(spriteMaterial);
	sprite.scale.set(100, 50, 1.0);
	return sprite;
}

// function for drawing rounded rectangles

function roundRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + w - r, y);
	ctx.quadraticCurveTo(x + w, y, x + w, y + r);
	ctx.lineTo(x + w, y + h - r);
	ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
	ctx.lineTo(x + r, y + h);
	ctx.quadraticCurveTo(x, y + h, x, y + h - r);
	ctx.lineTo(x, y + r);
	ctx.quadraticCurveTo(x, y, x + r, y);
	ctx.closePath();
	ctx.fill();
	ctx.stroke();
}

function animate() {
	requestAnimationFrame(animate);
	render();
	update();
}

function update() {
	// find intersections

	// create a Ray with origin at the mouse position
	//   and direction into the scene (camera direction)
	var vector = new THREE.Vector3( mouse.x, mouse.y, 1 );
	proj.unprojectVector( vector, camera );
	var ray = new THREE.Raycaster( camera.position, vector.sub( camera.position ).normalize() );

	// create an array containing all objects in the scene with which the ray intersects
	var intersects = ray.intersectObjects( boxes );

	// INTERSECTED = the object in the scene currently closest to the camera 
	//		and intersected by the Ray projected from the mouse position 	
	
	// if there is one (or more) intersections
	if ( intersects.length > 0 )
	{
		// if the closest object intersected is not the currently stored intersection object
		if ( intersects[ 0 ].object != INTERSECTED ) 
		{
		    // restore previous intersection object (if it exists) to its original color
			if ( INTERSECTED ) 
				INTERSECTED.material.color.setHex( INTERSECTED.currentHex );
			// store reference to closest object as current intersection object
			INTERSECTED = intersects[ 0 ].object;
			// store color of closest object (for later restoration)
			INTERSECTED.currentHex = INTERSECTED.material.color.getHex();
			// set a new color for closest object
			INTERSECTED.material.color.setHex( 0xffff00 );
		}
	} 
	else // there are no intersections
	{
		// restore previous intersection object (if it exists) to its original color
		if ( INTERSECTED ) 
			INTERSECTED.material.color.setHex( INTERSECTED.currentHex );
		// remove previous intersection object reference
		//     by setting current intersection object to "nothing"
		INTERSECTED = null;
	}

	controls.update();
	stats.update();
}

function render() {
	renderer.render(scene, camera);
}


// POI FUNCTIONS

function searchPOIs(lat, lng) {
	var center, searchPoint;
	var restQueryURL;

	if (!lat || !lng) {
		// center = map.getCenter();
		lat = 65.0167;
		lng = 25.4667;
	}

	searchRadius = 1000;

	console.log("Doing search from " + BACKEND_ADDRESS_POI);
	console.log("Map center: lat=" + lat + " lon=" + lng);
	restQueryURL = BACKEND_ADDRESS_POI + "radial_search?" +
		"lat=" + lat + "&lon=" + lng + "&query_id=" + queryID + "&radius=" +
		searchRadius + "&component=fw_core";
	console.log("restQueryURL: " + restQueryURL);
	miwi_poi_xhr = new XMLHttpRequest();

	miwi_poi_xhr.onreadystatechange = function() {
		if (miwi_poi_xhr.readyState === 4) {
			if (miwi_poi_xhr.status === 200) {
				// console.log("succes: " + miwi_poi_xhr.responseText);
				var json = JSON.parse(miwi_poi_xhr.responseText);
				parsePoiData(json);
				// console.log(json);
			} else if (miwi_poi_xhr.status === 404) {
				console.log("failed: " + miwi_poi_xhr.responseText);
			}
		}
	}

	miwi_poi_xhr.onerror = function(e) {
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

function parsePoiData(data) {
	var counter = 0,
		jsonData, poiData, pos, i, uuid, pois,
		contents, locations, location, searchPoint, poiCore;

	if (!data) {
		return;
	}

	console.log("Parsing POI data...");

	if (!data.hasOwnProperty("pois")) {
		log("Error: Invalid POI data.");
		return;
	}

	pois = data['pois'];

	for (uuid in pois) {
		poiData = pois[uuid];
		poiCore = poiData.fw_core;
		// console.log("poiCore=" + JSON.stringify(poiCore));
		if (poiCore && poiCore.hasOwnProperty("location")) {
			location = poiCore['location'];

			if (location['type'] === 'wsg84') {
				// pos = new google.maps.LatLng(location['latitude'],
				// 	location['longitude']);
				// miwi_poi_pois[uuid] = poiCore;
				// addPOI_UUID_ToMap(pos, poiCore, uuid);
				// counter++;

				var lat, lon, name;
				lat = (location['latitude'] * 100000) - 6501000;
				lon = (location['longitude'] * 100000) - 2547000;

				// console.log("lat: "+ lat);
				// console.log("lon: "+ lon);

				createBox(lat, lon, poiCore['name']);
			}
		}

		//console.log( poiData );

		// storePoi(uuid, poiCore);
	}
}