/* global console, document, window, createjs, ndgmr, gamePieceFactory */
/* global drawPlayer, drawRoadSegment, drawEnemyYellow, drawEnemyGreen, drawEnemyBlue */

window.onload = onLoad;

function onLoad(){	
	this.game = new CarGame();
}

function CarGame(){
	var stage = new createjs.Stage("gameCtx");
	var stageWidth = 800;
	var stageHeight = 600;
	//containers are used to prevent display sorting problemss
	var roadContainer;
	var coinContainer;
	var enemyContainer;
	var hudContainer;
	
	var loadQueue = new createjs.LoadQueue(true);
	
	//refernces to game objects
	var player;
	var spriteCoinGold;
	var spriteCoinSilver;
	var spriteCoinCopper;
	var spriteEnemyYellow;
	var	spriteEnemyGreen;
	var spriteEnemyBlue;
	var spriteExplosion;
	var activeCoins = [];
	var activeEnemies = [];
	var roadSegments = [];
	var scoreDisplay;
	
	//roadSegmentHeight is one pixel less than the actual graphics height.  This is done to avoid gaps/seams where the graphics meet.
	var roadSegmentHeight = 149;
	
	//variables used for car controls
	var rightDown = false;
	var leftDown = false;
	var playerBounds = [240, 560];
	var steeringMomentum = 0;
	var steeringAccelerationAmount = 0.05;
	var carVelocity;
	
	var score = 0;
	
	//coinSpawnTimeMin is the minimum interval in miliseconds between coin spawn events.  A random interveral is added to the min time for variation
	var coinSpawnTimeMin = 300;
	var coinSpawnTimeVariation = 700;
	var coinSpawnTimeNext;
	
	//enemy spawn intervals are handeled similarly to coin spawn times
	var enemySpawnTimeMin = 500;
	var enemySpawnTimeVariation = 900;
	var enemySpawnTimeNext;
	
	var transitionTimeUI = 500; //time in miliseconds between UI transitions
	var screenGameOver;
	var screenWelcome;
	
	var loadingText;
	
	var gameState;
	var states = {
		LOADING : "loading",
		STARTING : "starting",
		PLAYING : "playing",
		RESTARTING : "restarting",
		ENDING : "ending"
	};
	var assets = {
		COIN_GOLD : "coinGold",
		COIN_SILVER : "coinSilver",
		COIN_COPPER : "coinCopper",
		EXPLOSION : "explosion",
		SCREEN_GAME_OVER : "screenGameOver",
		SCREEN_WELCOME : "screenWelcome",
		PLAYER : "player",
		ROAD_SEGMENT : "roadSegment",
		ENEMY_BLUE : "enemyBlue",
		ENEMY_GREEN : "enemyGreen",
		ENEMY_YELLOW : "enemyYellow"
	};
	
	loadingText = new createjs.Text("Loading", "20px arial", "#ffffff");
	loadingText.x = 10;
	loadingText.y = 10;
	stage.addChild(loadingText);
	loadQueue.addEventListener("complete", onLoadQueueComplete);
	loadQueue.addEventListener("progress", onLoadProgress);
	//ctxshape files are javascript files that contain the canvas draw shape commands needed to draw various art elements
	loadQueue.loadManifest([
		{id:assets.COIN_GOLD, src:"art/coin_gold.png"},
		{id:assets.COIN_SILVER, src:"art/coin_silver.png"},
		{id:assets.COIN_COPPER, src:"art/coin_copper.png"},
		{id:assets.EXPLOSION, src:"art/explosion.png"},
		{id:assets.SCREEN_GAME_OVER, src:"art/screen_game_over.png"},
		{id:assets.SCREEN_WELCOME, src:"art/screen_welcome.png"},
		{id:assets.PLAYER, src:"art/player.ctxShape", type:createjs.LoadQueue.JAVASCRIPT},
		{id:assets.ROAD_SEGMENT, src:"art/roadSegment.ctxShape", type:createjs.LoadQueue.JAVASCRIPT},
		{id:assets.ENEMY_BLUE, src:"art/enemy_blue.ctxShape", type:createjs.LoadQueue.JAVASCRIPT},
		{id:assets.ENEMY_GREEN, src:"art/enemy_green.ctxShape", type:createjs.LoadQueue.JAVASCRIPT},
		{id:assets.ENEMY_YELLOW, src:"art/enemy_yellow.ctxShape", type:createjs.LoadQueue.JAVASCRIPT}
	]);
	gameState = states.LOADING;
	createjs.Ticker.setPaused(true);//pause ticker while content loads
	stage.update();
	
	//update loader
	function onLoadProgress(evt){
		loadingText.text = "Loading: " + Math.round(evt.progress * 100) + "%";
		stage.update();
		console.log( "Loading: " + Math.round(evt.progress * 100) + "%");
	}
	
	function onLoadQueueComplete(evt){
		console.log("asset loading complete");
		stage.removeChild(loadingText);
		//create the game's display objects
		createGamePieceBitmaps();
		//create game containers and add them to stage
		roadContainer = new createjs.Container();
		coinContainer = new createjs.Container();
		enemyContainer = new createjs.Container();
		hudContainer = new createjs.Container();
		stage.addChildAt(roadContainer, 0);
		stage.addChildAt(coinContainer, 1);
		stage.addChildAt(player, 2);
		stage.addChildAt(enemyContainer, 3);
		stage.addChildAt(hudContainer, 4);
		createjs.Ticker.setFPS(60);
		//add player's car to stage
		player.alpha = 0;
		//create and place road segments
		for(var i = 0; i < roadSegments.length; i++){
			roadContainer.addChild(roadSegments[i]);
			roadSegments[i].x = 0;
			roadSegments[i].y = i * roadSegmentHeight;
		}
		//create hud
		scoreDisplay = new createjs.Text("SCORE: 0", "20px arial", "#ffffff");
		scoreDisplay.x = 10;
		scoreDisplay.y = 10;
		hudContainer.addChild(scoreDisplay);
		//create event handlers for keyboard input
		document.onkeydown = onKeyDown;
		document.onkeyup = onKeyUp;
		//create event listener for game loop
		createjs.Ticker.addEventListener("tick", update);
		//pause ticker while content loads
		createjs.Ticker.setPaused(false);
		//pause and unpause the game when the window gains and looses focus
		window.onfocus = function(){createjs.Ticker.setPaused(false);};
		window.onblur = function(){createjs.Ticker.setPaused(true);};
		screenWelcome.x = 0;
		screenWelcome.y = 0;
		screenWelcome.alpha = 1;
		hudContainer.addChild(screenWelcome);
		stage.addEventListener("click", onGameStarting);
	}
	
	function onGameStarting(){
		stage.removeEventListener("click", onGameStarting);
		createjs.Tween.get(screenWelcome).to({alpha : 0}, transitionTimeUI).call(onGameStarted);
	}
	
	function onGameStarted(){
		hudContainer.removeChild(screenWelcome);
		resetGame();
	}
	
	//MAIN GAME LOOP
	function update(evt){
		if(!createjs.Ticker.getPaused()){
			if(gameState == states.PLAYING){
				var i;
				var isColliding;
				var newActiveCoins = [];
				var newActiveEnemies = [];

				//UPDATE PLAYER POSITION
				if(rightDown){
					steeringMomentum += (steeringAccelerationAmount * evt.delta);
				}
				if(leftDown){
					steeringMomentum -= (steeringAccelerationAmount * evt.delta);
				}
				player.x += steeringMomentum;
				steeringMomentum *= ((2.75 / createjs.Ticker.getFPS()) * evt.delta);
				player.rotation = steeringMomentum * 1;

				//SCROLL BACKGROUND
				for(i=0; i < roadSegments.length; i++){
					var roadY = roadSegments[i].y + (evt.delta * carVelocity);

					if(roadY > stageHeight) roadY -= (stageHeight + roadSegmentHeight);
					roadSegments[i].y = roadY;
				}
				//SPAWN NEW COINS
				if(evt.runTime > coinSpawnTimeNext){
					var spawnCount =  1 + Math.floor(Math.random() * 3);

					for(i = 0; i < spawnCount; i++){
						var newCoin;
						var coinType = Math.random();

						if(coinType < 0.1){
							newCoin = spriteCoinGold.clone();
							newCoin.pointValue = 200;
						} else if(coinType < 0.5){
							newCoin = spriteCoinSilver.clone();
							newCoin.pointValue = 100;
						} else {
							newCoin = spriteCoinCopper.clone();
							newCoin.pointValue = 50;
						}
						newCoin.play();
						newCoin.x = 219 + (330 * Math.random());
						newCoin.y = -40;
						coinContainer.addChild(newCoin);
						activeCoins.push(newCoin);
						coinSpawnTimeNext += coinSpawnTimeMin + (Math.random() * coinSpawnTimeVariation);
					}
				}
				//SPAWN NEW ENEMIES
				if(evt.runTime > enemySpawnTimeNext){
					var newEnemy;
					var enemyType = Math.floor(Math.random() * 3);

					if(enemyType === 0){
						newEnemy = spriteEnemyYellow.clone();
					} else if(enemyType === 1){
						newEnemy = spriteEnemyGreen.clone();
					} else {
						newEnemy = spriteEnemyBlue.clone();
					}
					newEnemy.velocity = 0.1;
					newEnemy.x = playerBounds[0] + ((playerBounds[1] - playerBounds[0]) * Math.random());
					newEnemy.y = -127;
					enemyContainer.addChild(newEnemy);
					activeEnemies.push(newEnemy);
					enemySpawnTimeNext += enemySpawnTimeMin + (Math.random() * enemySpawnTimeVariation);
				}
				//CHECK FOR COIN COLLISIONS AND OUT OF BOUNDS COINS
				for(i=0; i < activeCoins.length; i++){
					//transform coins
					activeCoins[i].y += evt.delta * carVelocity;
					isColliding = ndgmr.checkPixelCollision(player, activeCoins[i], 1);
					if(isColliding){
						var scorePopUp = new createjs.Text("+" + activeCoins[i].pointValue, "15px arial", "#ffffff");

						scorePopUp.x = isColliding.x;
						scorePopUp.y = isColliding.y;
						createjs.Tween.get(scorePopUp).wait(500).to({alpha:0}, 250).call(scorePopUPTweenComplete);
						hudContainer.addChild(scorePopUp);
						score += activeCoins[i].pointValue;
						coinContainer.removeChild(activeCoins[i]);

					} else {
						if(activeCoins[i].y < 632){
							newActiveCoins.push(activeCoins[i]);
						} else {
							coinContainer.removeChild(activeCoins[i]);
						}
					}
				}
				activeCoins = newActiveCoins;
				//CHECK FOR ENEMY COLLISIONS
				for(i=0; i < activeEnemies.length; i++){
					//transform enemies
					activeEnemies[i].y += (evt.delta * carVelocity) + (evt.delta * activeEnemies[i].velocity);
					isColliding = ndgmr.checkPixelCollision(player, activeEnemies[i], 1);
					if(isColliding){
						spriteExplosion.x = isColliding.x;
						spriteExplosion.y = isColliding.y;
						spriteExplosion.gotoAndPlay(0);
						stage.addChild(spriteExplosion);

						player.alpha = 0;
						activeEnemies[i].alpha = 0;
						carVelocity = 0;
						gameState = states.ENDING;
					}
					if(activeEnemies[i].y < 727){
						newActiveEnemies.push(activeEnemies[i]);
					} else {
						enemyContainer.removeChild(activeEnemies[i]);
					}
				}
				activeEnemies = newActiveEnemies;
				if(player.x < playerBounds[0]){
					steeringMomentum *= -2;
					player.x = playerBounds[0];
				}
				if(player.x > playerBounds[1]){
					steeringMomentum *= -2;
					player.x = playerBounds[1];
				}
				//UPDATE HUD
				scoreDisplay.text = "SCORE: " + score;
			}
			//UPDATE STAGE
			stage.update(evt);
			console.log();
		}
	}
	
	//creates bitmaps for game pieces from canvas shapes
	//shapes are converted to bitmaps for better performance and more accurate collison detection
	function createGamePieceBitmaps(){
		var i;
		var coinFrameRate = 20;
		
		//create player bitmap
		var playerShape = new createjs.Shape();
		
		playerShape.graphics.inject(drawPlayer);
		playerShape.cache(0, 0, 64, 133);
		player = new createjs.Bitmap(playerShape.cacheCanvas);
		player.regX = 32;
		player.regY = 66.5;
		
		//create yellow enemy sprite
		var shapeEnemyYellow = new createjs.Shape();
		
		shapeEnemyYellow.graphics.inject(drawEnemyYellow);
		shapeEnemyYellow.cache(0, 0, 63, 127);
		spriteEnemyYellow = new createjs.Bitmap(shapeEnemyYellow.cacheCanvas);
		spriteEnemyYellow.regX = 31.5;
		spriteEnemyYellow.regY = 63.5;
		
		//create green enemy sprite
		var shapeEnemyGreen = new createjs.Shape();
		
		shapeEnemyGreen.graphics.inject(drawEnemyGreen);
		shapeEnemyGreen.cache(0, 0, 63, 127);
		spriteEnemyGreen = new createjs.Bitmap(shapeEnemyGreen.cacheCanvas);
		spriteEnemyGreen.regX = 31.5;
		spriteEnemyGreen.regY = 63.5;
		
		//create blue enemy sprite
		var shapeEnemyBlue = new createjs.Shape();
		
		shapeEnemyBlue.graphics.inject(drawEnemyBlue);
		shapeEnemyBlue.cache(0, 0, 63, 127);
		spriteEnemyBlue = new createjs.Bitmap(shapeEnemyBlue.cacheCanvas);
		spriteEnemyBlue.regX = 31.5;
		spriteEnemyBlue.regY = 63.5;
		
		//create road segments
		var roadSegmentShape = new createjs.Shape();
		
		roadSegmentShape.graphics.inject(drawRoadSegment);
		roadSegmentShape.cache(0, 0, 800, 150);
		roadSegments[0] = new createjs.Bitmap(roadSegmentShape.cacheCanvas);
		for(i = 1; i < 6; i++){
			roadSegments[i] = roadSegments[0].clone();
		}
		//create gold coin sprite
		var coinGoldSheet = new createjs.SpriteSheet({
			images:[loadQueue.getResult(assets.COIN_GOLD)],
			frames: {width: 32, height: 32}
		});
		spriteCoinGold = new createjs.Sprite(coinGoldSheet, 0);
		spriteCoinGold.framerate = coinFrameRate;
		
		//create silver coin sprite
		var coinSilverSheet = new createjs.SpriteSheet({
			images:[loadQueue.getResult(assets.COIN_SILVER)],
			frames: {width: 32, height: 32}
		});
		spriteCoinSilver = new createjs.Sprite(coinSilverSheet, 0);
		spriteCoinSilver.framerate = coinFrameRate;
		
		//create copper coin sprite
		var coinCopperSheet = new createjs.SpriteSheet({
			images: [loadQueue.getResult(assets.COIN_COPPER)],
			frames: {width: 32, height: 32}
		});
		spriteCoinCopper = new createjs.Sprite(coinCopperSheet, 0);
		spriteCoinCopper.framerate = coinFrameRate;
		
		//create explosion sprite
		var explosionSheet = new createjs.SpriteSheet({
			images: [loadQueue.getResult(assets.EXPLOSION)],
			frames: {width: 256, height: 256}
		});
		spriteExplosion = new createjs.Sprite(explosionSheet, 0);
		spriteExplosion.scaleX = 3;
		spriteExplosion.scaleY = 3;
		spriteExplosion.regX = 128;
		spriteExplosion.regY = 128;
		spriteExplosion.addEventListener("animationend", onExplosionComplete);
		
		//create game over screen
		screenGameOver = new createjs.Bitmap(loadQueue.getResult(assets.SCREEN_GAME_OVER));
		
		//create welcome screen
		screenWelcome = new createjs.Bitmap(loadQueue.getResult(assets.SCREEN_WELCOME));
	}
	
	function onExplosionComplete(evt){
		spriteExplosion.stop();
		stage.removeChild(spriteExplosion);
		screenGameOver.alpha = 0;
		createjs.Tween.get(screenGameOver).to({alpha:1}, transitionTimeUI);
		hudContainer.addChild(screenGameOver);
		stage.addEventListener("click", startGameReset);
	}
	
	function startGameReset(){
		var i;
		
		gameState = states.RESTARTING;
		createjs.Tween.get(screenGameOver, {override:true}).to({alpha:0}, transitionTimeUI).call(resetGame);
		stage.removeEventListener("click", startGameReset);
		for(i = 0; i < activeCoins.length; i++){
			createjs.Tween.get(activeCoins[i]).to({alpha:0}, transitionTimeUI);
		}
		for(i = 0; i < activeEnemies.length; i++){
			createjs.Tween.get(activeEnemies[i]).to({alpha:0}, transitionTimeUI);
		}
	}
	
	//called when starting or resetting a game
	function resetGame(){
		var i;
		
		if(screenGameOver.parent == hudContainer) hudContainer.removeChild(screenGameOver);
		for(i = 0; i < activeCoins.length; i++){
			coinContainer.removeChild(activeCoins[i]);
		}
		for(i = 0; i < activeEnemies.length; i++){
			enemyContainer.removeChild(activeEnemies[i]);
		}
		activeCoins = [];
		activeEnemies = [];
		//position player
		player.x = 400;
		player.y = stageHeight + player.getBounds().height;
		createjs.Tween.get(player).to({y: stageHeight - (player.getBounds().height * 0.5) - 20}, 2000);
		player.alpha = 1;
		//reset player attributes
		carVelocity = 0.5;
		steeringMomentum = 0;
		//reset score
		score = 0;
		//set spawn timer for coins and enemies
		console.log("time: " + createjs.Ticker.getTime(true));
		coinSpawnTimeNext = createjs.Ticker.getTime(true) + 2000;
		enemySpawnTimeNext = createjs.Ticker.getTime(true) + 3000;
		gameState = states.PLAYING;
		//reset car controlls
		leftDown = false;
		rightDown = false;
	}
	
	function scorePopUPTweenComplete(evt){
		hudContainer.removeChild(evt.target);
	}
	
	function onKeyDown(evt){
		if(gameState == states.PLAYING){
			switch(evt.keyCode){
					case 37: //left
						leftDown = true;
						break;
					case 39: //right
						rightDown = true;
						break;
			}
		}
	}
	
	function onKeyUp(evt){
		if(gameState == states.PLAYING){
			switch(evt.keyCode){
					case 37: //left
						leftDown = false;
						break;
					case 39: //right
						rightDown = false;
						break;
			}
		}
	}
}