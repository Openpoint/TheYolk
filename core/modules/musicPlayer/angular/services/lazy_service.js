'use strict'

angular.module('yolk').factory('lazy',[function() {

	/*
	 * construct the lazy loader and scrolling for track listings to improve rendering performance of ng-repeat
	 *
	 * */

	var $scope;
	var lazy = function(scope){
		$scope = scope;
		this.Top = 0;
		this.trackHeight = 130;
		this.progressHeight = 10;
		this.playingHeight = this.trackHeight+this.progressHeight;
		this.chunk = 0;
		this.over=7 //how many times the window height worth of tracks to fetch
		this.O = Math.floor(this.over/3);
		watchScroll();
	}
	//set the padding in the playwindow
	lazy.prototype.fixChrome = function(){
		$scope.drawers.drawerPos();

		if($scope.lazy.chunk){
			var padding = (($scope.lazy.Step*$scope.lazy.chunk*this.O)-($scope.lazy.Step*this.O))*$scope.lazy.trackHeight;
		}else{
			var padding = 0;
		}
		if($scope.drawers.dpos[$scope.pin.Page].inlist){
			var height = $scope.lib.size*$scope.lazy.trackHeight+$scope.drawers.dpos[$scope.pin.Page].height;
		}else{
			var height = $scope.lib.size*$scope.lazy.trackHeight;
		}
		$scope.dims.dyn = {
			paddingTop:padding,
			height:height-padding+$scope.lazy.trackHeight
		}
		if($scope.drawers.dpos[$scope.pin.Page].pad){
			$scope.drawers.dpos[$scope.pin.Page].spacer = $scope.drawers.dpos[$scope.pin.Page].height;
		}else{
			$scope.drawers.dpos[$scope.pin.Page].spacer = 0;
		}

		$('#tracks').css($scope.dims.dyn);
	}


	lazy.prototype.scroll = function(scrolltop){
		if(!scrolltop) scrolltop = $('#playwindow').scrollTop();
		if($scope.drawers.dpos[$scope.pin.Page].fix){
			scrolltop-=$scope.drawers.dpos[$scope.pin.Page].height;
			this.chunk = Math.floor(scrolltop/(this.chunkHeight*this.O));
			//console.error(this.chunk)
			//if(newchunk > this.chunk||$scope.drawers.dpos[$scope.pin.Page].vis==='above') this.chunk = newchunk;
		}else{
			this.chunk = Math.floor(scrolltop/(this.chunkHeight*this.O));
			//console.warn(this.chunk)
		}

		if(this.chunk >= $scope.drawers.dpos[$scope.pin.Page].inChunk){
			$scope.drawers.dpos[$scope.pin.Page].pad = true;
		}else{
			$scope.drawers.dpos[$scope.pin.Page].pad = false;
		}
		this.Top = this.Step*this.chunk;
		this.Bottom = this.Top+this.Step;
	}

	lazy.prototype.step = function(top){
		this.winHeight = $scope.dims.playwindowHeight;
		this.Step = Math.ceil(this.winHeight/this.trackHeight);
		this.chunkHeight = this.Step*this.trackHeight;
		this.scroll(top||$scope.dims.scrollTop);
	}

	// get the relative position of the currently playing track in the track window
	lazy.prototype.getPos = function(i){
		var self = this;
		$scope.lib.playing.filter.pos = i;
		//self.spacer=true;
		if($scope.pin.Page !== 'title'||$scope.tracks.nofocus){
			setTimeout(function(){
				playPos.bottom();
			})
			return;
		}
		if(i > -1){
			$scope.lib.playing.top = i*$scope.lazy.trackHeight;
			$scope.lib.playing.bottom = $scope.lib.playing.top + $scope.lazy.trackHeight;
			self.playPos(true);
		}else{
			playPos.bottom();
		}
	}

	// decide if the currently playing track should stick to top or bottom of screen
	var playPos = {
		clear:function(){
			//console.log('clear')
			$scope.lib.playing.Top = false;
			$scope.lib.playing.Bottom = false;
			$scope.lib.playing.Pinned = false;
			$('#playing .inner').css({
				position:'static',
				top:'auto',
				bottom:'auto'
			}).removeClass('Top Bottom');
		},
		top:function(){
			//console.log('top')
			$('#playing .inner').css({
				position:'fixed',
				top:$scope.dims.menHeight+$scope.dims.searchHeight,
				bottom:'auto'
			}).addClass('Top').removeClass('Bottom');
			$scope.lib.playing.Bottom = false;
			$scope.lib.playing.Top = true;
			$scope.lib.playing.Pinned = true;
		},
		bottom:function(){
			//console.log('bottom')
			$('#playing .inner').css({
				position:'fixed',
				top:'auto',
				bottom:0
			}).addClass('Bottom').removeClass('Top');
			$scope.lib.playing.Top = false;
			$scope.lib.playing.Bottom = true;
			$scope.lib.playing.Pinned = true;
		}
	}
	// decide if the currently playing track should stick to top or bottom of screen
	lazy.prototype.playPos = function(fix){
		if(!$scope.lib.playing) return;
		if($scope.pin.Page!=='title'||($scope.pin.Page==='title' && $scope.lib.playing.filter.pos === -1)||$scope.tracks.nofocus){
			playPos.bottom();
			return;
		}
		if($scope.lib.playing.filter.pos > -1){
			if(fix){
				playPos.clear();
			}
			if($scope.dims.scrollTop - $scope.lib.playing.top > 0){
				if(!$scope.lib.playing.Top){
					playPos.top();
				}
			}else if($scope.dims.scrollTop + $scope.lazy.winHeight - $scope.lib.playing.bottom <= 0){
				if(!$scope.lib.playing.Bottom){
					playPos.bottom();
				}
			}else if($scope.lib.playing.Top || $scope.lib.playing.Bottom){
				playPos.clear();
			}
		}
	}

	//focus-scroll to the playing track
	lazy.prototype.Scroll=function(dir){

		if (dir === 'down'){
			var scroll = $scope.lib.playing.top - $scope.lazy.trackHeight
		}else if (dir ==='up'){
			var scroll = $scope.lib.playing.bottom - $scope.dims.playwindowHeight + $scope.lazy.trackHeight
		}
		$('#playwindow').animate({scrollTop:scroll},1000,'swing');
	}

	var watchScroll = function(){
		// watch for scrolling of the track list
		var scrollfix;
		var t=0;
		$('#playwindow').scroll(function(e){
			clearTimeout(scrollfix); // in a long list scrolling by the handle goes too fast for the scroll event - do a automatic cleanup
			$scope.dims.scrollTop = $('#playwindow').scrollTop()
			$scope.lazy.playPos();
			scrollfix = setTimeout(function(){
				$scope.drawers.drawerPos();
				$scope.search.go(false,'scroll');
			},100);


		});
	}
	return lazy;
}])
