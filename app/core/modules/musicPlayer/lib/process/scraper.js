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

document.cookie = "CONSENT=YES";

document.addEventListener("DOMNodeInserted", function(event) {
	window._Yolk_.$ = window._Yolk_.jQuery = require('jquery');
})
window._Yolk_={};

window._Yolk_.event = new CustomEvent('_Yolk_', {'pid':window.process.pid});
window.dispatchEvent(window._Yolk_.event);


window._Yolk_.Promise  = require("bluebird");
window._Yolk_.getPID = function(){
	return window.process.pid;
}
window._Yolk_.scrape = function(){
    var promise = new _Yolk_.Promise(function(resolve,reject){
        var paths = []
        resolve(_Yolk_.$('#view_images img').first().attr('src'));
    });
    return promise;
}
window._Yolk_.firstClick=function(i){

    var promise = new _Yolk_.Promise(function(resolve,reject){

        if(!_Yolk_.$('#search img').length){
            reject('no images found');
            return;
        }
        var first = _Yolk_.$('#search img').eq(i);

        _Yolk_.$('img').not(first).remove();
        _Yolk_.$(first).click();
        setTimeout(function(){
            watcher();
        },500)

        var retry = 0
        function watcher(){
            var batch = [];
            if(_Yolk_.$('img').length > 1){
                _Yolk_.$.each(_Yolk_.$('img').not(first),function(){

                    if(_Yolk_.$(this).attr('src') && _Yolk_.$(this).attr('src').indexOf('http') === 0 && _Yolk_.$(this).attr('src').indexOf('maxresdefault') === -1 && _Yolk_.$(this).attr('src').indexOf('/social/') === -1){
                        batch.push(_Yolk_.$(this).attr('src'))
                    }
                })

            }
            if(batch[0]){
                resolve(batch[0]);
            }else{
                retry++
                if(retry < 5){
                    setTimeout(function(){
                        watcher()
                    },1000)
                }else{
                    reject('retry');
                }

            }
        }

    })
    return promise;
}
    //}
//});
