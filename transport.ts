import {Util} from './util';

declare var rhea: any;
declare var window: any;

export class Transport {
    private clientEH: any;
    private clientIH: any;
    private connectionEH: any;
    private connectionIH: any;
    private sendable: boolean;
    private webSocketUrl: string;
    private ehPath: string;
    private ehCG: string;
    private ehHost: string;
    private iHAccount: string;
    private sharedAccessKeyName: string;
    private sharedAccessKey: string;
    private partitionCount: number;
    private partitionIds: Array<number>;
    private messageTimeOffset: number;
    private remainingOpenReceiver: number;
    private initializedIH: boolean;
    private initializedEH: boolean;
    public onMessage: Function;
    public onReadyToSend: Function;
    public onReadyToReceive: Function;
    public onIHConnectionClose: Function;
    public onEHConnectionClose: Function;
    public ehTopics: Array<string>;
    public ihTopic: string;
    public createSuccess: boolean;

    private managementSender: any;
    private messageSender: any;

    private optionsEH: any;
    private optionsIH: any;

    public initializeIH(iotHubConnectionString: string) {
        var matches = RegExp('HostName=(.*)\\.azure-devices\\.net;SharedAccessKeyName=(.*);SharedAccessKey=(.*)').exec(iotHubConnectionString);
        if(!matches || !matches[1]|| !matches[2]|| !matches[3]) {
            alert('invalid iot hub connection string');
            this.createSuccess = false;
            return;
        }
        
        this.iHAccount = matches[1];
        this.sharedAccessKeyName = matches[2];
        this.sharedAccessKey = matches[3];

        this.optionsIH = {
            "hostname" : this.iHAccount+".azure-devices.net",
            "container_id" : "conn" + new Date().getTime(),
            "max_frame_size" : 4294967295,
            "channel_max" : 65535,
            "idle_timeout" : 120000,
            "outgoing_locales" : 'en-US',
            "incoming_locales" : 'en-US',
            "offered_capabilities" : null,
            "desired_capabilities" : null,
            "properties" : {},
            "connection_details":null,
            "reconnect":false,
            "username":this.sharedAccessKeyName+'@sas.root.'+this.iHAccount,
            "password":Util.getSASToken(this.iHAccount,this.sharedAccessKey,this.sharedAccessKeyName),
            "onSuccess":null,
            "onFailure":null,
        };
        this.sendable = false;
        this.ihTopic = '/messages/devicebound';
        var Container = window.require('rhea');
        this.clientIH = new Container();
        this.createSuccess = true;
        this.initializedIH = true;
    }

    public initializeEH(eventHubEndPoint: string,eventHubName: string,eventHubConsumerGroup: string, messageTimeOffset: number = 0) {
        var matches = RegExp('sb://(.*)/').exec(eventHubEndPoint);
        if(!matches || !matches[1]) {
            alert('invalid event hub endpoint');
            this.createSuccess = false;
            return;
        }
        this.ehHost = matches[1];
        
        if(!eventHubName) {
            alert('invalid event hub name');
            this.createSuccess = false;
            return;
        }
        if(!eventHubConsumerGroup) {
            alert('invalid event hub consumer group');
            this.createSuccess = false;
            return;
        }

        this.optionsEH = {
            "hostname" : this.ehHost,
            "container_id" : "conn" + new Date().getTime(),
            "max_frame_size" : 4294967295,
            "channel_max" : 65535,
            "idle_timeout" : 120000,
            "outgoing_locales" : 'en-US',
            "incoming_locales" : 'en-US',
            "offered_capabilities" : null,
            "desired_capabilities" : null,
            "properties" : {},
            "connection_details":null,
            "reconnect":false,
            "username":this.sharedAccessKeyName,
            "password":this.sharedAccessKey,
            "onSuccess":null,
            "onFailure":null,
        };

        this.messageTimeOffset = messageTimeOffset;
        this.remainingOpenReceiver = 3;
        this.ehPath = eventHubName;
        this.ehCG = eventHubConsumerGroup;
        this.ehTopics = new Array();
        var Container = window.require('rhea');
        this.clientEH = new Container();
        this.createSuccess = true;
        this.initializedEH = true;
    }

    public connectIH(success: Function, fail: Function) {
        if(!this.initializedIH) {
            console.log('not initialized');
            return;
        }
        var wsIH = this.clientIH.websocket_connect(WebSocket);
        this.optionsIH.connection_details = wsIH("wss://" + this.iHAccount + ".azure-devices.net:443/$servicebus/websocket?iothub-no-client-cert=true", ["AMQPWSB10"]);
        this.clientIH.on('connection_open',(context) => {
            if(success) {
                success();
            } 
            this.messageSender = this.connectionIH.open_sender(this.ihTopic);
        });
        this.clientIH.on('connection_error',(context) => {
            if(fail) fail();
        });
        this.clientIH.on('connection_close',(context) => {
            if(this.onIHConnectionClose) this.onIHConnectionClose();
        });
        this.clientIH.on('sendable', (context) => {
            this.sendable = true;
            if(context.sender.local.attach.target.value[0].value === this.ihTopic && this.onReadyToSend) this.onReadyToSend();
        });
        this.clientIH.on("message", (context) => {
            console.log('onmessage called should not use!!');
        });
        this.connectionIH = this.clientIH.connect(this.optionsIH);
    }

    public connectEH(success: Function, fail: Function) {
        if(!this.initializedEH) {
            console.log('not initialized');
            return;
        }
        var wsEH = this.clientEH.websocket_connect(WebSocket);
        this.optionsEH.connection_details = wsEH("wss://" + this.ehHost + ":443/$servicebus/websocket", ["AMQPWSB10"]);
        this.clientEH.on('connection_open',(context) => {
            if(success) {
                success();
            }
            this.ehTopics.push('$management');
            this.managementSender = this.connectionEH.open_sender('$management');
            this.connectionEH.open_receiver('$management');
        });
        this.clientEH.on('connection_error',(context) => {
            if(fail) fail();
        });
        this.clientEH.on('connection_close',(context) => {
            if(this.onEHConnectionClose) this.onEHConnectionClose();
        });
        this.clientEH.on('sendable', (context) => {
            console.log('on sendable!!!');
            context.sender.send({
                body:this.clientEH.message.data_section(Util.str2ab('[]')),
                application_properties: { 
                    operation: 'READ',
                    name: this.ehPath,
                    type: 'com.microsoft:eventhub' 
                } 
            });
        });
        this.clientEH.on('receiver_open',(context) => {
            this.remainingOpenReceiver --;
            if(this.remainingOpenReceiver === 0 && this.onReadyToReceive) {
                this.onReadyToReceive();
            }
        });
        this.clientEH.on("message", (context) => {
            console.log('onmessage called!!');
            if(context.receiver.source.address === '$management') {
                var p = context.message.body;
                this.partitionCount = p.partition_count;
                this.remainingOpenReceiver += (this.partitionCount-2);
                this.partitionIds = p.partition_ids;

                this.partitionIds.forEach((pid) => {
                    this.ehTopics.push('/'+this.ehPath+'/ConsumerGroups/'+this.ehCG+'/Partitions/'+pid);
                    this.connectionEH.open_receiver({
                        source: {
                            address:'/'+this.ehPath+'/ConsumerGroups/'+this.ehCG+'/Partitions/'+pid,
                            filter:this.clientEH.filter.selector("amqp.annotation.x-opt-enqueuedtimeutc > " +(new Date().getTime() + this.messageTimeOffset).toString())
                        }
                    });
                }, this);
            }else {
                if(this.onMessage) this.onMessage(context.message.message_annotations['iothub-connection-device-id'],Util.Utf8ArrayToStr(context.message.body.content));
            }
        });
        this.connectionEH = this.clientEH.connect(this.optionsEH);
    }

    public disconnectIH() {
        this.clientIH.disconnect();
    }

    public disconnectEH() {
        this.clientEH.disconnect();
    }

    public send(deviceId: string,payload: string) {
        if (!this.sendable) {
            alert('not ready to send message');
            return false;
        }
        this.messageSender.send({to:'/devices/'+deviceId+this.ihTopic,body:this.clientIH.message.data_section(Util.str2ab(payload))});
    }
}