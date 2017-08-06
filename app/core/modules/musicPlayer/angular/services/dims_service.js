"use strict"

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

angular.module('yolk').factory('dims',[function() {
	var $scope;
	var dims=function(scope){
		$scope = scope;
		this.menHeight = 35;
		this.trackHeight = 130;
		this.searchHeight = 35;
		this.sidebarWidth = this.trackHeight*2;
		this.scroller = 15;
		this.drawerHeight = 0;
		this.scrollTop = 0;
	}
	dims.prototype.resume=function(scope){
		$scope = scope;
		return this;
	}
	dims.prototype.update = function(){
		this.playwindowWidth = $(window).width() - this.sidebarWidth -2;
		if($scope.playlist.active){
			this.playwindowHeight = $(window).height() - this.menHeight;
		}else{
			this.playwindowHeight = $(window).height() - this.menHeight - this.searchHeight;
		}

		this.sidebarHeight = $(window).height() - this.menHeight;
	}

	$(window).resize(function(){
		$scope.$apply(function(){
			$scope.dims.update();
		})	
	});

	return dims;
}])
