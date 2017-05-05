'use strict'

angular.module('yolk').factory('lazy',['$timeout',function($timeout) {

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
		this.memory = {
			title:{},
			album:{},
			artist:{}
		};
		watchScroll();
	}

	lazy.prototype.refresh = function(sTop){
		if(sTop){
			var top = sTop;
		}else{
			var top = 0;
			this.chunk = 0;
			$('#playwindow').scrollTop(top);
		}
		this.step(top);
		this.getPos();

	}

	lazy.prototype.scroll = function(){
		/*
		if($scope.lazy.drawer && $scope.lazy.drawer.active){
			$scope.lazy.drawer.offset = $('#drawer'+$scope.lazy.drawer.id).offset().top+$scope.lazy.drawer.height-$scope.dims.menHeight-$scope.dims.searchHeight;
			console.log($scope.lazy.drawer.offset);
		}
		*/
		var scrolltop = $('#playwindow').scrollTop()
		//console.log(scrolltop)
		this.chunk = Math.floor(scrolltop/this.chunkHeight);
		if($scope.lazy.drawer && $scope.lazy.drawer.active === $scope.pin.Page && !$scope.lazy.drawer.chunk) $scope.lazy.drawer.chunk = this.chunk
		this.Top = this.Step*this.chunk;
		this.Bottom = this.Top+this.Step*2;
	}

	lazy.prototype.step = function(drawer){
		this.winHeight = $scope.dims.playwindowHeight;
		this.Step = Math.ceil(this.winHeight/this.trackHeight);
		if($scope.lazy.drawer && $scope.lazy.drawer.active === $scope.pin.Page) this.Step = this.Step + Math.ceil($scope.lazy.drawer.height/this.trackHeight);
		this.chunkHeight = this.Step*this.trackHeight;
		this.scroll();
	}

	// get the relative position of the currently playing track in the track window
	lazy.prototype.getPos = function(){
		var self = this;
		$timeout(function(){
			if($scope.lib.playing && $scope.lib.playing.state){
				self.spacer=true;
				var i = $scope.lib.playing.filter.pos;
				if(i > -1){
					$scope.lib.playing.top = i*$scope.lazy.trackHeight;
					$scope.lib.playing.bottom = $scope.lib.playing.top + $scope.lazy.trackHeight;
					self.playPos($('#playwindow').scrollTop(),true);
				}else{
					playPos.bottom();
				}
			}
		});
	}

	// decide if the currently playing track should stick to top or bottom of screen
	var playPos = {
		clear:function(){
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
	lazy.prototype.playPos = function(stop,fix){
		if($scope.lib.playing && ($scope.pin.Page!=='title'||($scope.pin.Page==='title' && $scope.lib.playing.filter.pos === -1))){
			playPos.bottom();
			return;
		}

		if($scope.lib.playing && $scope.lib.playing.filter.pos > -1){

			if(fix){
				playPos.clear();
			}

			if(stop - $scope.lib.playing.top > 0){
				if(!$scope.lib.playing.Top){
					//console.log('top');
					playPos.top();
				}
			}else if(stop + $scope.lazy.winHeight - $scope.lib.playing.bottom <= 0){
				if(!$scope.lib.playing.Bottom){
					//console.log('bottom');
					playPos.bottom();
				}
			}else if($scope.lib.playing.Top || $scope.lib.playing.Bottom){
				//console.log('middle');
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
		$('#playwindow').scroll(function(e){

			$timeout.cancel(scrollfix); // in a long list scrolling by the handle goes too fast for the scroll event - do a automatic cleanup
			var scrollTop = $scope.dims.scrollTop = $('#playwindow').scrollTop();
			$scope.lazy.playPos(scrollTop);
			scrollfix = $timeout(function(){
				$scope.lazy.scroll();
				$scope.search.go();
				$scope.scrolling =false;

			},100);
		});
	}

	return lazy;
}])
