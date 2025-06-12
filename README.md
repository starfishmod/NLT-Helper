# NLT Helper
This is a commandline tool for working with [Next Level Timing](https://nextleveltiming.com/) v.4.6.0+

This is purely a demo application and may not suit your needs.
We use this with [Brisbane RC Mini and Micro Buggy Racing](https://www.facebook.com/groups/bneminibuggies) to track our daily progress with heats and finals where we have 2 classes.
While NLT is a great product (I recommend using it!), it doesn't support some of these thing easily (at least not yet - hint hint :P ).

What does it do:
* Has a countdown announcement - so racers have more than the start beep.
* Has a serial driver to announce start, end, laptimes and last lap. We use this with a Led display panel
* Has class handling - add a class record heat results to a class
* Generate standings for finals - we run a simple 2 heats and one final. It doesn't handle multiple finals etc.
* Announces the current fastest lap for the day for each class.

Run this using nodejs on the commandline. Yes it should've been a Web app :P

### How to use the App
After startup you'll be presented with a command prompt:
```
NLT Bridge> 
```
Hitting tab will give you several options:
#### help 
Provides help...
 
#### apikey [api]
Sets the apikey needed to connect to NLT. You'll find this apikey in the Setting Neon Timing page

#### ip [ip]            
Sets the ip to find NLT - defaults to 127.0.0.1 

#### port [port]        
Sets the serial port for sending strings to display. Hitting Tab after the port will give you a list of ports.

#### clearclasses
Clear all class data - do this at the beginning of the Race day.

#### addclass [class]
Adds a new Class. For example we have two classes: "micro" and "mini". So this becomes:
```
NLT Bridge> addclass micro
NLT Bridge> addclass mini
```

#### nextrace [class] [heat]
Set the next class and heat that is racing. Tabbing will let you choose from the classes added.
This records the results that stored for the day to generate the ordering for the finals. 

#### dropHeats [dropHeat]
Amount of heat to drop the lowest points. e.g. ```dropHeats 2``` will drop the two lowest scoring heats.
Most times this should be set to one. Run this before the ```results``` command.
  
#### results [class]
See a filtered list of best laps and times for the day for a class. Use this to set up the order for the finals.

#### debug  
Toggle Debug - not really needed but helpful to see messages between NLT and this app

#### exit  
Exits application.


