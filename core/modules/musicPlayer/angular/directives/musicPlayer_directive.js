"use strict"

angular.module('yolk').directive('yolkReady', function() {

    return function(scope, element, attrs) {
        if(scope.$first||scope.$last){

            var count = 0;
            scope.$parent.lib.tracks.map(function(track){
                //track.filter.pos = scope.$parent.lazy.Top+count;
                //count++;
            })
        }

        //scope.$parent.lib.tracks[scope.$index].filter.pos = scope.$index+scope.$parent.lazy.Top
        //scope.track.filter.pos = scope.$index+scope.$parent.lazy.Top;
    };
});
