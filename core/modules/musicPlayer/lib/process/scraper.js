document.cookie = "CONSENT=YES";

document.addEventListener("DOMNodeInserted", function(event) {
    if(!window.jQuery){
        window.$ = window.jQuery = require('jquery');
    }
})

window.q = require("bluebird");
window.scrape = function(){
    var promise = new Promise(function(resolve,reject){
        var paths = []
        resolve($('#view_images img').first().attr('src'));
    });
    return promise;
}
window.firstClick=function(i){

    var promise = new Promise(function(resolve,reject){

        if(!$('#search img').length){
            reject('no images found');
            return;
        }
        var first = $('#search img').eq(i);

        $('img').not(first).remove();
        $(first).click();
        setTimeout(function(){
            watcher();
        },500)

        var retry = 0
        function watcher(){
            console.log('watcher')
            var batch = [];
            if($('img').length > 1){
                $.each($('img').not(first),function(){

                    if($(this).attr('src') && $(this).attr('src').indexOf('http') === 0 && $(this).attr('src').indexOf('maxresdefault') === -1 && $(this).attr('src').indexOf('/social/') === -1){
                        batch.push($(this).attr('src'))
                    }
                })

            }
            console.log(batch)
            if(batch[0]){
                console.log(batch[0])
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
