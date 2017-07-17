"use strict"

angular.module('yolk').directive('linkWidget', function() {
    return function(scope, element, attrs) {
		scope.widget.title = scope.widget.title.trim();
        var newtit = scope.widget.title.substring(0,30);
		if(newtit.length !== scope.widget.title.length) scope.widget.title = newtit+'...'
    };
}).directive('onErrorSrc', function() {
    return {
        link: function(scope, element, attrs) {
          element.bind('error', function() {
            attrs.$set('src', 'core/lib/css/noimage.png');
          });
        }
    }
});
