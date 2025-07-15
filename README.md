# NLT Helper
This is a commandline tool for working with [Next Level Timing](https://nextleveltiming.com/) v.4.6.0+

This is purely a demo application and may not suit your needs.
We use this with [Brisbane RC Mini and Micro Buggy Racing](https://www.facebook.com/groups/bneminibuggies) to track our daily progress with heats and finals where we have 2 classes.
While NLT is a great product (I recommend using it!), it doesn't support some of these thing easily (at least not yet - hint hint :P ).

What does it do:
* Has a countdown announcement - so racers have more than the start beep.
* Has a serial driver to announce start, end, laptimes and last lap. We use this with a LED display panel
* Has class handling - add a class record heat results to a class
* Generate standings for finals - we run a simple 2 heats and one final. It doesn't handle multiple finals etc.
* Announces the current fastest lap for the day for each class.

Run this using Node.js on the commandline, or use the executable in the releases. 
Yes, it should've been a Web app :P

To see how it works:
https://www.youtube.com/watch?v=nXCQyP0KglI 

### How to use the App
After startup, you'll be presented with a command prompt:
```
NLT Bridge> 
```
Hitting tab will give you several options:
#### help 
Provides help...
 
#### apikey ```api_key```
Sets the apikey needed to connect to NLT. You'll find this apikey in the Setting Neon Timing page

#### ip ```ip_address```            
Sets the ip to find NLT - defaults to 127.0.0.1 

#### port ```serial_port```        
Sets the serial port for sending strings to display. Hitting Tab after the port will give you a list of ports.

#### mute ```[countdown,fastestClass,lineup]```
Mute the audio for different NLT Events.
* countdown - is the built-in countdown on start race
* fastestClass - don't say the "fastest lap for xxx class" audio. This stops the ovelapping speech.
* lineup - don't say the "Line Up for XXX class..."

#### unmute ```[countdown,fastestClass,lineup]```
Start using the audio again :)

#### clearclasses
Clear all class data - do this at the beginning of the Race day. This no 
longer removes all the classes.

#### addclass ```new_class_name```
Adds a new Class. For example, we have two classes: "micro" and "mini". So this becomes:
```
NLT Bridge> addclass micro
NLT Bridge> addclass mini
```

#### removeclass ```class_name```
Delete any unused classes.

#### nextheat ```class_name``` ```heat_number``` ```group(opt: A, B, C etc)```
Set the next class and heat that is racing. Tabbing will let you choose from the classes added.
This records the results that stored for the day to generate the ordering for the finals.
The Group field allows you to run multiple Groups of the same class.
```
NLT Bridge> nextheat micro 1
micro class to line up for Heat 1
```
After the first Heat, it will generate a line-up order based on the last heat. 
Drivers that did not race in the previous heat will not be listed.
``` 
NLT Bridge> nextrace micro 2
┌─────────────┬────────┐
│ Line Up POS │ Name   │
├─────────────┼────────┤
│      1      │ demo-4 │
│      2      │ demo-2 │
│      3      │ demo-1 │
│      4      │ demo-5 │
│      5      │ demo-3 │
│      6      │ demo-7 │
│      7      │ demo-6 │
└─────────────┴────────┘
m class  to line up for Heat 2

```

#### removeheat ```class_name``` ```heat_number``` ```group(opt)```
If a race goes bad, and you need to remove the data from NLT Helper. Use this so you can re-run.

#### dropheats ```number_of_heats_to_drop```
Amount of heat to drop the lowest points. e.g. ```dropHeats 2``` will drop the two lowest scoring heats.
Most times this should be set to one. Run this before the ```results``` command.

#### points ```points_from_1st_onwards...```
Set the points for each position. For example:
```
NLT Bridge> points 20 18 17 16 15 14 13 12 11 10 9 8 7 6 5 4 3 2 1
```
The above sets 1st place to have 20 points, 2nd is 18 points etc. for each heat. 

#### splitfinals ```number_of_racers_in_each_final_group```
The amount of racers in each final group. This provides a one or more splits as seen in the results for a class.

#### results ```class_name```
See a filtered list of best laps and times for the day for a class. Use this to set up the order for the finals.
```
NLT Bridge> results micro
┌──────┬────────┬────────┬─────────────┬─────────────┬─────────────┐
│ POS  │ Name   │ Points │      Heat 1 │      Heat 2 │      Heat 3 │
├──────┼────────┼────────┼─────────────┼─────────────┼─────────────┤
│ A 1  │ demo-5 │   10   │ 7/01:06.764 │ 7/01:02.669 │ 7/01:06.458 │
│ A 2  │ demo-4 │   10   │ 6/01:00.459 │ 7/01:05.361 │ 7/01:03.363 │
│ A 3  │ demo-7 │   10   │ 7/01:05.388 │ 7/01:09.240 │ 7/01:05.733 │
│ A 4  │ demo-3 │   8    │ 7/01:06.739 │ 6/01:01.408 │ 7/01:04.564 │
├──────┼────────┼────────┼─────────────┼─────────────┼─────────────┤
│ B 1  │ demo-6 │   7    │ 7/01:07.665 │ 7/01:07.080 │ 7/01:04.603 │
│ B 2  │ demo-2 │   6    │ 7/01:06.795 │ 6/01:00.143 │ 7/01:05.469 │
│ B 3  │ demo-1 │   6    │ 7/01:08.242 │ 7/01:07.628 │ 7/01:06.379 │
└──────┴────────┴────────┴─────────────┴─────────────┴─────────────┘
Fastest Lap: demo-5 8.016 secs
NLT Bridge> 
```

#### final ```class_name``` ```group(opt: A, B, C etc)```
Like ```nextheat``` this sets the racing up for the final for each class and finals group.
Rerun ```results``` to see the heats and finals for a class.
_Note: multiple finals are not handled yet._

#### debug  
Toggle Debug - not really needed, but helpful to see messages between NLT and this app

#### exit  
Exits application.

## Clubs Using NLT Helper 
Please let us know if you use this software - it helps me keep motivated :)

| Club                                                                                                       | link                                                                                                            |
|------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------|
| <img src="https://github.com/user-attachments/assets/a9086b3b-b85d-4df2-8cd6-1790629a6bb5" width="100px"/> | [High Rollers RC Funpark](https://www.facebook.com/profile.php?id=61560016574097) (Michigan, USA)               |
| <img src="https://github.com/user-attachments/assets/ff38d5b8-af60-42ab-9591-d19d81dc4a7f" width="100px"/> | [Brisbane RC Mini and Micro Buggy Racing](https://www.facebook.com/groups/bneminibuggies) (Brisbane, Australia) |

