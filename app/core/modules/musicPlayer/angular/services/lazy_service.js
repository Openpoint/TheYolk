'use strict'

/*
Copyright 2017 Michael Jonker (http://openpoint.ie)
This file is part of The Yolk.
The Yolk is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
any later version.
The Yolk is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.
You should have received a copy of the GNU General Public License
along with The Yolk.  If not, see <http://www.gnu.org/licenses/>.
*/

angular.module('yolk').factory('lazy',['$timeout',function($timeout) {

	/*
	 * construct the lazy loader and scrolling for track listings to improve rendering performance of ng-repeat
	 *
	 * */
	const log=false;
	var $scope;
	var lazy = function(scope){
		$scope = scope;
		this.Top = 0;
		this.trackHeight = $scope.dims.trackHeight;
		this.progressHeight = 10;
		this.playingHeight = this.trackHeight+this.progressHeight;
		this.chunk = 0;
		this.over=7 //how many times the window height worth of tracks to fetch
		this.O = Math.floor(this.over/3);
		watchScroll();
	}
	lazy.prototype.resume=function(scope){
		$scope = scope;
		watchScroll();
		return this;
	}
	//set the padding in the playwindow
	lazy.prototype.fixChrome = function(scrolltop){
		var self = this;
		if(log) console.log('lazy','fixChrome('+scrolltop+')');
		//Yolk.print($scope.drawers.dpos[$scope.pin.Page]);
		//console.warn('Chunk: '+this.chunk)
		if($scope.lazy.chunk){
			var padding = (($scope.lazy.Step*$scope.lazy.chunk*this.O)-($scope.lazy.Step*this.O))*$scope.lazy.trackHeight;
		}else{
			var padding = 0;
		}

		var height = $scope.lib.size*$scope.lazy.trackHeight;
		$scope.dims.dyn = {
			paddingTop:padding,
			paddingBottom:$scope.lazy.trackHeight,
			height:height-padding
		}

		if(!$scope.drawers.dpos[$scope.pin.Page].open) return;
		//if($scope.drawers.dpos[$scope.pin.Page].inlist){

			height = $scope.lib.size*$scope.lazy.trackHeight+$scope.drawers.dpos[$scope.pin.Page].height;
			$scope.dims.dyn.height = height - padding;
		//}
		if($scope.drawers.dpos[$scope.pin.Page].pad){
			$scope.drawers.dpos[$scope.pin.Page].spacer = $scope.drawers.dpos[$scope.pin.Page].height;
		}else{
			$scope.drawers.dpos[$scope.pin.Page].spacer = 0;
		}

	}


	lazy.prototype.scroll = function(scrolltop,skip){
		if(log) console.log('lazy','scroll('+scrolltop+')');
		if(typeof scrolltop === 'undefined') scrolltop = $('#playwindow').scrollTop();

		this.chunk = Math.floor(scrolltop/(this.chunkHeight*this.O));
		this.Top = this.Step*this.chunk;
		this.Bottom = this.Top+this.Step;

		if($scope.pin.Page === 'title'||!$scope.drawers.dpos[$scope.pin.Page].open || skip) return;

		if($scope.drawers.dpos[$scope.pin.Page].fix){
			scrolltop-=$scope.drawers.dpos[$scope.pin.Page].height;
			this.chunk = Math.floor(scrolltop/(this.chunkHeight*this.O));
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
		if(log) console.log('lazy','step()');
		this.winHeight = $scope.dims.playwindowHeight;
		this.Step = Math.ceil(this.winHeight/this.trackHeight);
		this.chunkHeight = this.Step*this.trackHeight;
		this.chunkSize = this.Step*this.O;
		if(typeof top === 'undefined') top =  $scope.dims.scrollTop;
		this.scroll(top);
	}

	// get the relative position of the currently playing track in the track window
	lazy.prototype.getPos = function(i){
		if(log) console.log('lazy','getPos()');
		if(!$scope.lib.playing.filter) return;
		var self = this;
		$scope.lib.playing.filter.pos = i;
		if(i > -1){
			$scope.lib.playing.top = i*$scope.lazy.trackHeight;
			$scope.lib.playing.bottom = $scope.lib.playing.top + $scope.lazy.trackHeight;
		}
	}

	// decide if the currently playing track should stick to top or bottom of screen
	var pPos;
	var pPlay;
	var playPos = {
		clear:function(){
			pPos = false;
			pPlay = $scope.playlist.active;
			if(log) console.warn('lazy','playPos.clear()');
			$scope.$apply(function(){
				$scope.lib.playing.Top = false;
				$scope.lib.playing.Bottom = false;
				$scope.lib.playing.Pinned = false;
				$scope.lib.playingstyle = {
					position:'static',
					top:'auto',
					bottom:'auto',
					width:$scope.dims.playwindowWidth - $scope.dims.scroller
				}
			})
			/*
			$('#playing .inner').css({
				position:'static',
				top:'auto',
				bottom:'auto'
			}).removeClass('Top Bottom');
			*/
		},
		top:function(){
			pPos = 't';
			pPlay = $scope.playlist.active;
			if(log) console.warn('lazy','playPos.top()');
			/*
			$('#playing .inner').css({
				position:'fixed',
				top:$scope.playlist.active?$scope.dims.menHeight+1:$scope.dims.menHeight+$scope.dims.searchHeight+2,
				bottom:'auto'
			}).addClass('Top').removeClass('Bottom');
			*/
			$scope.$apply(function(){
				$scope.lib.playing.Bottom = false;
				$scope.lib.playing.Top = true;
				$scope.lib.playing.Pinned = true;
				$scope.lib.playingstyle = {
					position:'fixed',
					top:$scope.playlist.active?$scope.dims.menHeight+1:$scope.dims.menHeight+$scope.dims.searchHeight+2,
					bottom:'auto',
					width:$scope.dims.playwindowWidth - $scope.dims.scroller,
					left:$scope.dims.sidebarWidth+1
				}
			})

		},
		bottom:function(){
			pPos = 'b';
			pPlay = $scope.playlist.active;
			if(log) console.warn('lazy','playPos.bottom()');
			/*
			$('#playing .inner').css({
				position:'fixed',
				top:'auto',
				bottom:0
			}).addClass('Bottom').removeClass('Top');
			*/
			$scope.$apply(function(){
				$scope.lib.playing.Top = false;
				$scope.lib.playing.Bottom = true;
				$scope.lib.playing.Pinned = true;
				$scope.lib.playingstyle = {
					position:'fixed',
					top:'auto',
					bottom:0,
					width:$scope.dims.playwindowWidth - $scope.dims.scroller,
					left:$scope.dims.sidebarWidth+1
				}
			})

		}
	}
	// decide if the currently playing track should stick to top or bottom of screen

	lazy.prototype.playPos = function(reset){
		if(!$scope.lib.playing||!$scope.lib.playing.filter) return;
		if(reset) pPos = 'reset';
		if(log) console.log('lazy','playPos()');
		if($scope.lib.playing.filter.pos > -1 && !$scope.tracks.source.type){
			if($scope.dims.scrollTop - $scope.lib.playing.top > 0){
				if(pPos!=='t'||pPlay!==$scope.playlist.active) playPos.top();
			}else if($scope.dims.scrollTop + $scope.lazy.winHeight - $scope.lib.playing.bottom <= 0){
				if(pPos!=='b') playPos.bottom();
			}else if(pPos){
				playPos.clear();
			}
		}else if(pPos!=='b') playPos.bottom();
	}

	//focus-scroll to the playing track
	lazy.prototype.Scroll=function(dir){
		if(log) console.log('lazy','Scroll()');
		if (dir === 'down'){
			var scroll = $scope.lib.playing.top - $scope.lazy.trackHeight
		}else if (dir ==='up'){
			var scroll = $scope.lib.playing.bottom - $scope.dims.playwindowHeight + $scope.lazy.trackHeight
		}
		$('#playwindow').animate({scrollTop:scroll},1000,'swing');
	}

	var watchScroll = function(){
		if(log) console.log('lazy','watchScroll()');
		// watch for scrolling of the track list
		var scrollfix;
		var t = 0;
		var t2 = 0;
		var t3;
		$('#playwindow')[0].addEventListener('scroll',function(e){
			$scope.dims.scrollTop = e.target.scrollTop;
			$scope.search.setScroll(e.target.scrollTop);

			if($scope.search.brake){
				$timeout.cancel(t3);
				return;
			}
			if(e.timeStamp -t2 > 40){
				t2 = e.timeStamp;
				$scope.lazy.playPos();
			}
			if(e.timeStamp -t > 490){
				$timeout.cancel(t3);
				t = e.timeStamp;
				t3 = $timeout(function(){
					var oc = $scope.lazy.chunk;
					$scope.drawers.drawerPos('watchscroll');
					if(oc !== $scope.lazy.chunk){
						$scope.search.go(false,'scroll');
					}
				},500)
			};
		},{passive:true});
	}
	return lazy;
}])
