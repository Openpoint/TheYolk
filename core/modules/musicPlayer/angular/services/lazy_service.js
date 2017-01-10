'use strict'

angular.module('yolk').factory('lazy',['$timeout',function($timeout) {

	/*
	 * construct the lazy loader ans scrolling for track listings to improve rendering performance of ng-repeat
	 *
	 * */

	var $scope;
	var lazy = function(scope){
		$scope = scope;
		this.Top = 0;
		this.trackHeight = 130;
		this.progressHeight = 10;
		this.playingHeight = this.trackHeight+this.progressHeight;
		this.paddingTop = 0;
		this.chunk = 0;
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

	lazy.prototype.scroll = function(sTop){

		this.chunk = Math.floor((sTop || $('#playwindow').scrollTop()) / this.chunkHeight);
		this.Top = this.Step*this.chunk;
		this.Bottom = this.Top+this.Step*2;
		//this.paddingTop = this.chunkHeight*(this.chunk-1);
		//this.paddingBottom = (this.libSize*this.trackHeight)-this.paddingTop - this.chunkHeight*2;
		if(this.paddingBottom < 0){
			this.paddingBottom =0;
		}
		if(sTop){
			$timeout(function(){
				$('#playwindow').scrollTop(sTop);
			});
		}
	}

	lazy.prototype.step = function(sTop){
		this.winHeight = $scope.dims.playwindowHeight;
		this.Step = Math.ceil(this.winHeight/this.trackHeight);
		this.chunkHeight = this.Step*this.trackHeight;
		//this.libSize is got from the tracks_filter filter
		this.scroll(sTop);
	}

	// get the relative position of the currently playing track in the track window
	lazy.prototype.getPos = function(){
		var self = this;
		$timeout(function(){
			if($scope.lib.playing && $scope.lib.playing.state){
				$scope.spacer=true;
				//var i = $scope.lib.tracks.indexOf($scope.lib.playing);
				var i = $scope.lib.playing.filter.pos;
				if(i >= 0){
					$scope.lib.playing.top = i*$scope.lazy.trackHeight;
					$scope.lib.playing.index=i;

				}else{
					$scope.lib.playing.top = 0;
					$scope.lib.playing.index = $scope.lib.tracks.length
					$scope.spacer=false;
				}

				$scope.lib.playing.bottom = $scope.lib.playing.top + $scope.lazy.trackHeight;
				self.playPos($('#playwindow').scrollTop(),true);
			}
		});
	}

	// decide if the currently playing track should stick to top or bottom of screen
	lazy.prototype.playPos = function(stop,fix){

		if($scope.lib.playing){

			if(fix){
				$scope.lib.playing.Top = false;
				$scope.lib.playing.Bottom = false;
				$scope.lib.playing.Pinned = false;
				$('#playing .inner').css({
					position:'static',
					top:'auto',
					bottom:'auto'
				}).removeClass('Top Bottom');
			}

			if(stop - $scope.lib.playing.top > 0){
				if(!$scope.lib.playing.Top){
					//console.log('top');
					$('#playing .inner').css({
						position:'fixed',
						top:$scope.dims.menHeight+$scope.dims.searchHeight,
						bottom:'auto'
					}).addClass('Top').removeClass('Bottom');
					$scope.lib.playing.Top = true;
					$scope.lib.playing.Pinned = true;


				}
			}else if(stop + $scope.lazy.winHeight - $scope.lib.playing.bottom <= 0){
				if(!$scope.lib.playing.Bottom){
					//console.log('bottom');
					$('#playing .inner').css({
						position:'fixed',
						top:'auto',
						bottom:0
					}).addClass('Bottom').removeClass('Top');
					$scope.lib.playing.Bottom = true;
					$scope.lib.playing.Pinned = true;

				}
			}else if($scope.lib.playing.Top || $scope.lib.playing.Bottom){
				//console.log('middle');
				$('#playing .inner').css({
					position:'static',
					top:'auto',
					bottom:'auto'
				}).removeClass('Top Bottom');
				$scope.lib.playing.Top = false;
				$scope.lib.playing.Bottom = false;
				$scope.lib.playing.Pinned = false;

			}
			if($scope.lib.playing.filter.pos === -1){
				$('#playing .inner').addClass('Top');
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
			if(
				scrollTop > $scope.lazy.chunkHeight*($scope.lazy.chunk+1) ||
				scrollTop < $scope.lazy.chunkHeight*($scope.lazy.chunk)
			){
				//scrollTop = $('#playwindow').scrollTop();
				//$scope.lazy.playPos(scrollTop);

			}else{
				//$scope.lazy.playPos(scrollTop);
			}

			scrollfix = $timeout(function(){
				$scope.lazy.scroll();
				switch($scope.Sort){
					case "artist":
						$scope.search.artist();
						break;
					case "album":
						$scope.search.album();
						break;
					default:
						$scope.search.go();
				}
				$scope.scrolling =false;
			},100);
		});
	}
	return lazy;
}])
