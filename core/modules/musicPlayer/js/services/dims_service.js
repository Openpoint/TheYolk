"use strict"

angular.module('yolk').factory('dims',[function() {
	var dims=function(){
		this.menHeight = 30;
		this.sidebarWidth = 300;
		this.scroller = 15;			
	}
	dims.prototype.update = function(){
		this.playwindowWidth = $(window).width() - this.sidebarWidth;
		this.playwindowHeight = $(window).height() - this.menHeight;
		this.sidebarHeight = $(window).height() - this.menHeight;
	}
	
	return dims;	
}])
