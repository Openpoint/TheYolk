document.addEventListener("DOMNodeInserted", function(event) {
    if (!!window && !(!!window.$)) {
        window.$ = window.jQuery = require('jquery');
        window.q = require('promise');
        window.scrape = function(){
            var promise = new q(function(resolve,reject){
                var paths = []
                resolve($('#view_images img').first().attr('src'));
            });
            return promise;
        }
        window.firstClick=function(i){
            var promise = new q(function(resolve,reject){

                var first = $('#search img').eq(i);
                $('img').not(first).remove();
                $(first).click();
                function watcher(){
                    var batch = [];
                    if($('img').length > 1){
                        $.each($('img').not(first),function(){
                            if($(this).attr('src') && $(this).attr('src').indexOf('http') === 0 && $(this).attr('src').indexOf('maxresdefault') === -1){
                                batch.push($(this).attr('src'))
                            }
                        })

                    }
                    if(batch[0]){
                        resolve(batch[0]);
                    }else{
                        setTimeout(function(){
                            watcher()
                        },500)
                    }
                }
                watcher();
            })
            return promise;
        }
    }
});
