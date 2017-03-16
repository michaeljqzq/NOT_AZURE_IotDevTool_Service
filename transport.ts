import {Util} from './util';

declare var rhea: any;
declare var window: any;

export class Transport {
    private clientEH: any;
    private clientIH: any;
    private connectionEH: any;
    private connectionIH: any;
    private connected: boolean;
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
    private connectSuccessCount: number;
    public onMessage: Function;
    public onReadyToSend: Function;
    public onConnectionLost: Function;
    

    private managementSender: any;
    private messageSender: any;

    private optionsEH: any;
    private optionsIH: any;

    constructor(eventHubEndPoint: string,eventHubName: string,eventHubConsumerGroup: string, iotHubConnectionString: string, messageTimeOffset: number = 0) {
        var matches = RegExp('sb://(.*)/').exec(eventHubEndPoint);
        if(!matches || !matches[1]) {
            alert('invalid event hub endpoint');
            return;
        }
        this.ehHost = matches[1];
        matches = RegExp('HostName=(.*)\\.azure-devices\\.net;SharedAccessKeyName=(.*);SharedAccessKey=(.*)').exec(iotHubConnectionString);
        if(!matches || !matches[1]|| !matches[2]|| !matches[3]) {
            alert('invalid iot hub connection string');
            return;
        }
        this.iHAccount = matches[1];
        this.sharedAccessKeyName = matches[2];
        this.sharedAccessKey = matches[3];

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
        this.messageTimeOffset = messageTimeOffset;
        this.connectSuccessCount = 0;
        this.sendable = false;
        this.ehPath = eventHubName;
        this.ehCG = eventHubConsumerGroup;
        var Container = window.require('rhea');
        this.clientEH = new Container();
        this.clientIH = new Container();
    }

    public connect(success: Function, fail: Function) {
        var wsEH = this.clientEH.websocket_connect(WebSocket);
        this.optionsEH.connection_details = wsEH("wss://" + this.ehHost + ":443/$servicebus/websocket", ["AMQPWSB10"]);
        this.clientEH.on('connection_open',(context) => {
            this.connectSuccessCount++;
            if(success && this.connectSuccessCount === 2) {
                success();
            }
            this.managementSender = this.connectionEH.open_sender('$management');
            this.connectionEH.open_receiver('$management');
            this.connected = true;
        });
        this.clientEH.on('connection_error',(context) => {
            if(fail) fail();
            this.connected = false;
        });
        this.clientEH.on('connection_close',(context) => {
            this.connected = false;
            if(this.onConnectionLost) this.onConnectionLost();
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
        this.clientEH.on("message", (context) => {
            console.log('onmessage called!!');
            if(context.receiver.source.address === '$management') {
                var p = context.message.body;
                this.partitionCount = p.partition_count;
                this.partitionIds = p.partition_ids;

                this.partitionIds.forEach((pid) => {
                    this.connectionEH.open_receiver({
                        source: {
                            address:'/'+this.ehPath+'/ConsumerGroups/'+this.ehCG+'/Partitions/'+pid,
                            filter:this.clientEH.filter.selector("amqp.annotation.x-opt-enqueuedtimeutc > " +(new Date().getTime() + this.messageTimeOffset).toString())
                        }
                    });
                }, this);
            }else {
                if(this.onMessage) this.onMessage(context.message.body);
            }
        });
        this.connectionEH = this.clientEH.connect(this.optionsEH);

        var wsIH = this.clientIH.websocket_connect(WebSocket);
        this.optionsIH.connection_details = wsIH("wss://" + this.iHAccount + ".azure-devices.net:443/$servicebus/websocket", ["AMQPWSB10"]);
        this.clientIH.on('connection_open',(context) => {
            this.connectSuccessCount++;
            if(success && this.connectSuccessCount++ === 2) {
                success();
            } 
            this.messageSender = this.connectionIH.open_sender('/messages/devicebound');
            this.connected = true;
        });
        this.clientIH.on('connection_error',(context) => {
            if(fail) fail();
            this.connected = false;
        });
        this.clientIH.on('connection_close',(context) => {
            this.connected = false;
            if(this.onConnectionLost) this.onConnectionLost();
        });
        this.clientIH.on('sendable', (context) => {
            this.sendable = true;
            if(context.sender.local.attach.target.value[0].value === '/messages/devicebound' && this.onReadyToSend) this.onReadyToSend();
        });
        this.clientIH.on("message", (context) => {
            console.log('onmessage called should not use!!');
        });
        this.connectionIH = this.clientIH.connect(this.optionsIH);
    }

    public disconnect() {
        //this.client.disconnect(); no disconnect method?
    }

    public send(deviceId: string,payload: string) {
        if (!this.connected || !this.sendable) {
            alert('not connected or not ready to send message');
            return false;
        }
        this.messageSender.send({to:'/devices/'+deviceId+'/messages/devicebound',body:this.clientIH.message.data_section(Util.str2ab(payload))});
    }
}