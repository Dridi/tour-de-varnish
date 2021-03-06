AngleUtils = {
	/**
	 * Full revolution.
	 */
	REV: Math.PI * 2,

	/**
	 * [-PI..PI)
	 */
	mod: function(angle) {
		// most likely 0..1 iteration each
		while (angle >=  Math.PI) angle -= this.REV;
		while (angle <  -Math.PI) angle += this.REV;
		return angle;
	}
};

/**
 * A stop watch...
 */
StopWatch = function(threshold) {
	var start = new Date().getTime();

	this.elapsed = function() {
		return (new Date().getTime() - start) > threshold;
	};

	this.progress = function() {
		return (new Date().getTime() - start) / threshold;
	}
};

/**
 * This object keeps track of the planet's state and operations.
 *
 * It's basically a sphere, with a texture. It can rotate both manually or
 * automatically (also clumsily). It can travel from a destination to
 * another and will draw its path on the map.
 */
Earth = function(scene) {
	var sphere = new THREE.Object3D();
	var travel;
	var canvas = document.createElement('canvas');

	sphere.position.z = -500;
	scene.add(sphere);

	canvas.width = 1024;
	canvas.height = 512;

	var ctx = canvas.getContext('2d');
	ctx.drawImage($('#world_map')[0], 0, 0);

	var texture = new THREE.Texture(canvas);
	var geometry = new THREE.SphereGeometry(200, 20, 20);
	var material = new THREE.MeshBasicMaterial({
		map: texture,
		overdraw: true
	});
	var mesh = new THREE.Mesh(geometry, material);
	sphere.add(mesh);

	var traceRoute = function(alpha) {
		if (travel.paths.length == 0) {
			return;
		}

		var ctx = canvas.getContext('2d');
		ctx.strokeStyle = travel.color;
		ctx.lineWidth = 4;

		for (var i=0; i < travel.paths.length; i++) {
			var start = travel.paths[i][0];
			var goal  = travel.paths[i][1];
			var current = start.clone().lerp(goal, alpha);
			ctx.beginPath();
			ctx.moveTo(start.x, start.y);
			ctx.lineTo(current.x, current.y);
			ctx.stroke();
		}
	};

	var traceSteps = function(target) {
		if (!target) {
			return;
		}
		var ctx = canvas.getContext('2d');
		ctx.strokeStyle = travel.color;
		ctx.fillStyle = travel.color;
		for (var s in target.steps) {
			var step = target.steps[s];
			ctx.beginPath();
			ctx.arc(step.cx, step.cy, 4, 0, AngleUtils.REV);
			ctx.stroke();
			ctx.fill();
		}
	};

	this.travelTo = function(trip, duration) {
		travel = {
			// give a 200ms delay for the stage to catch up
			walk: new StopWatch(duration),
			step: new StopWatch(duration + 200),
			start: sphere.quaternion.clone(),
			goal: trip.goal,
			source: trip.source,
			target: trip.target,
			color: trip.color,
			paths: trip.paths
		}
		traceSteps(travel.source);
	};

	this.walk = function() {
		var alpha = Math.min(travel.walk.progress(), 1);
		var current = new THREE.Quaternion();

		THREE.Quaternion.slerp(travel.start, travel.goal, current, alpha);

		sphere.setRotationFromQuaternion(current);
		texture.needsUpdate = true;
		traceRoute(alpha);

		if (travel.walk.elapsed()) {
			traceSteps(travel.target);
		}

		return travel.step.elapsed();
	};

	this.rotate = function(rotation) {
		texture.needsUpdate = true;
		sphere.rotation.x += rotation.x;
		sphere.rotation.y += rotation.y;
	};

	this.splash = function() {
		var targetCanvas = $('canvas')[0];
		var ctx = targetCanvas.getContext('2d');
		ctx.drawImage(canvas, 0, 0, targetCanvas.width, targetCanvas.height);
	};

	this.printRotation = function() {
		return "Rotation:\nx=" + sphere.rotation.x + "\ny=" + sphere.rotation.y;
	};
};

/**
 * This object keeps track of the places we visit.
 *
 * It will look at the places we've been, and the new or old destinations we
 * want to reach. It will find the best trips for us so that we can happily
 * walk the earth.
 */
Journey = function() {
	var places = [];

	var findRoute = function(destination) {
		var source, target, color;

		if (destination) {
			destination.rx = AngleUtils.mod(destination.rx);
			destination.ry = AngleUtils.mod(destination.ry);

			source = places.length == 0 ? null : places[places.length - 1];
			target = destination;
			places.push(destination);
			color = 'red';
			direction = 1;
		}
		else {
			source = places.pop();
			target = places.length == 0 ? null : places[places.length - 1];
			color = 'yellow';
			direction = -1;
		}

		if (target == null) {
			target = source;
			source = null;
		}

		return {
			source: source,
			target: target,
			color: color,
			direction: direction
		};
	};

	var breakPath = function(paths, start, end, bx) {
		paths.push([
			new THREE.Vector2(start.cx-(bx*1024), start.cy),
			new THREE.Vector2(end.cx, end.cy)
		]);
		paths.push([
			new THREE.Vector2(start.cx, start.cy),
			new THREE.Vector2(end.cx+(bx*1024), end.cy)
		]);
	};

	var findPaths = function(route) {
		if (!route.source) {
			return [];
		}

		var paths = [];
		var source = route.source;
		var target = route.target;

		for (var s in source.steps) {
			var start = source.steps[s];
			for (var e in target.steps) {
				var end = target.steps[e];
				if (target.bx === route.direction) {
					breakPath(paths, start, end, target.bx);
				}
				else {
					paths.push([
						new THREE.Vector2(start.cx, start.cy),
						new THREE.Vector2(end.cx, end.cy)
					]);
				}
			}
		}
		return paths;
	};

	var quaternion = function(route) {
		var euler = new THREE.Euler(route.target.rx, route.target.ry)
		return new THREE.Quaternion().setFromEuler(euler).normalize();
	};

	this.prepareTrip = function(destination) {

		var route = findRoute(destination);
		var paths = findPaths(route);
		var goal = quaternion(route);

		return {
			source: route.source,
			target: route.target,
			color: route.color,
			paths: paths,
			goal: goal
		};
	};

};

/**
 * This action makes the earth rotate on its Y axis.
 */
Globe = function(context) {
	var transition = '';

	this.animate = function() {
		// TODO time-based speed
		context.earth.rotate({x: 0, y: 0.04});
		return transition;
	};

	this.handler = function(keyboardEvent) {
		if (keyboardEvent.type != 'keyup') {
			return;
		}
		if (keyboardEvent.keyCode == 33) {
			transition = 'prev';
		}
		if (keyboardEvent.keyCode == 34) {
			transition = 'next';
		}
	};
};

/**
 * This action travels from the current position to the next destination.
 *
 * It has to buy new shoes at each destination, because you know, so much
 * walking tends to be bad for your shoes.
 */
EarthWalker = function(context, transition) {
	var hasShoes = false;
	var stopWatch;
	var duration;
	var trip;

	this.init = function(args) {
		var destination;
		if (transition == 'prev') {
			destination = null;
			stopWatch = new StopWatch(1000);
		}
		else {
			destination = context.destinations[args.destination];
			stopWatch = new StopWatch(args.wait);
		}
		duration = args.duration;
		trip = context.journey.prepareTrip(destination);
	}

	this.animate = function() {
		if ( ! stopWatch.elapsed() ) {
			context.earth.walk(); // lazy way to trigger a redraw
			return '';
		}
		else if( ! hasShoes) {
			context.earth.travelTo(trip, duration);
			hasShoes = true;
		}

		return context.earth.walk() ? transition : '';
	};
};

/**
 * This action renders the earth as a flat map.
 */
Monad = function(context) {
	var transition = '';

	this.init = function() {
		context.earth.splash();
	}

	this.fini = function() {
		var targetCanvas = $('canvas')[0];
		var ctx = targetCanvas.getContext('2d');
		ctx.fillStyle = 'black';
		ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
	}

	this.animate = function() {
		return transition;
	};

	this.noRender = true;

	this.handler = function(keyboardEvent) {
		if (keyboardEvent.type != 'keyup') {
			return;
		}
		if (keyboardEvent.keyCode == 33) {
			transition = 'prev';
		}
		if (keyboardEvent.keyCode == 34) {
			transition = 'next';
		}
	};
};

/**
 * This action can take over the world, TONIGHT!
 *
 * With a special device operated by Pinky, the Brain can rotate the earth at
 * will and even print its rotation angles. I find this handy to find good
 * angles for the destinations.
 */
TheBrain = function(context) {
	// left top right bottom FTW
	var l = 0, t = 0, r = 0, b = 0;

	var isKeyPressed = function(type) {
		return (type == "keydown") ? 1 : 0;
	};

	this.animate = function() {
		// TODO time-based speed
		context.earth.rotate({
			x: 0.02 * (b - t),
			y: 0.02 * (r - l)
		});
		return '';
	};

	this.handler = function(keyboardEvent) {
		var type = keyboardEvent.type;
		switch (keyboardEvent.keyCode) {
			case 37: l = isKeyPressed(type); break;
			case 38: t = isKeyPressed(type); break;
			case 39: r = isKeyPressed(type); break;
			case 40: b = isKeyPressed(type); break;
		}
		if (type == "keyup" && keyboardEvent.keyCode == 32) {
			console.log( context.earth.printRotation() );
		}
	};
};

/**
 * This action travels to parallel 2D worlds.
 *
 * It basically makes the SVG element and the rightful slide visible.
 */
Slider = function(context, transition) {
	var index = -1;
	var slideList;

	// XXX $(slide).addClass('active') didn't work for me...
	var activate = function(slide) {
		var classes = $(slide).attr('class');
		$(slide).attr('class', classes + ' active');
	};

	// XXX $(slide).removeClass('active') didn't work for me...
	var deactivate = function(slide) {
		var classes = $(slide).attr('class');
		if (classes) {
			$(slide).attr('class', classes.replace(' active', ''));
		}
	};

	var showNextSlide = function() {
		if (index >= 0 && index < slideList.length) {
			deactivate('g.active');
			activate('#' + slideList[index]);
		}
	};

	this.init = function(args) {
		slideList = args;
		switch (transition) {
			case 'next': index = 0; break;
			case 'prev': index = slideList.length - 1; break;
		}
		showNextSlide();
		$('#slides').attr('class', 'active');
	};

	this.fini = function() {
		$('#slides').attr('class', '');
	};

	this.animate = function() {
		switch (index) {
			case -1:
				index++;
				return 'prev';
			case slideList.length:
				index--;
				return 'next';
			default:
				return '';
		}
	};

	this.handler = function(keyboardEvent) {
		if (keyboardEvent.type != 'keyup') {
			return;
		}
		if (keyboardEvent.keyCode == 33) {
			index--;
			showNextSlide();
		}
		if (keyboardEvent.keyCode == 34) {
			index++;
			showNextSlide();
		}
	};

	this.noRender = true;
};

/**
 * This action basically waits until it gets bored. Is that even useful ?
 */
Waiter = function() {
	var bored = '';

	this.animate = function() {
		return bored;
	};

	this.handler = function(keyboardEvent) {
		if (keyboardEvent.type != 'keyup') {
			return;
		}
		if (keyboardEvent.keyCode == 33) {
			bored = 'prev';
		}
		if (keyboardEvent.keyCode == 34) {
			bored = 'next';
		}
	};
};

/**
 * This object eats data and produces a presentation in return.
 *
 * The presentation is data-driven and relies on three items:
 * - destinations
 *   It consists in named places, their 2D coordinates on the map and their
 *   rotation angles on earth's X and Y axes.
 * - a route
 *   The route contains a list of steps to follow. Those steps are represented
 *   as programmatic actions.
 * - slides
 *   The slides are really just an SVG file that is inserted in the page's DOM.
 *
 * Actions are expected to provide behaviour at each step, and can receive
 * parameters from the route. The route can basically pass anything
 * serializable as JSON, the rest is available from the context. They also need
 * to declare an `animate' function which will return 'next' to indicate
 * whether it is time to pick the next action. It can also have a `handler'
 * method that will be registered for the keyup and keydown events.  The
 * presence of a `noRender' field set to true will inform the stage that no 3D
 * rendering is needed.
 */
Stage = function(context) {
	var camera, scene, renderer;
	var action, current;

	camera = new THREE.PerspectiveCamera(60, 4.0/3.0, 1, 2000);
	scene = new THREE.Scene();
	renderer = new THREE.CanvasRenderer();

	current = -1;
	context.earth = new Earth(scene);
	context.earth.rotate({x: -0.4, y: 0});
	context.journey = new Journey();

	$('body').append(renderer.domElement);

	var pickIndex = function(transition) {
		var index;
		switch (transition) {
			case 'next': index = current + 1; break;
			case 'prev': index = current - 1; break;
			default: throw new Error("unknown transition: " + transition);
		}
		return Math.max(0, Math.min(index, context.route.length - 1));
	}

	var pickAction = function(transition) {
		var index = pickIndex(transition);
		if (current == index) {
			return;
		}

		var clazz = context.route[index].clazz;
		var args  = context.route[index].args;
		var newAction = eval('new ' + clazz + '(context, transition)');
		current = index;

		if (action && typeof action.handler == 'function') {
			$(window).off('keydown keyup', action.handler);
		}

		if (action && typeof action.fini == 'function') {
			action.fini();
		}

		action = newAction;

		if (action && typeof action.handler == 'function') {
			$(window).on('keydown keyup', action.handler);
		}

		if (action && typeof action.init == 'function') {
			action.init(args);
		}
	};

	var animate = function() {
		transition = action.animate();
		if (transition) {
			pickAction(transition);
		}
		requestAnimationFrame(animate);
		if (!action.noRender) {
			renderer.render(scene, camera);
		}
	};

	this.resize = function() {
		renderer.setSize(window.innerWidth, window.innerHeight);
	};

	this.init = function() {
		this.resize();
		pickAction('next');
		animate();
	}
};

function endJourney() {
	return "On arrête le voyage ???";
}
